# Performance investigation — 2026-10-06

This report records the first optimization round. The [borrowed-span follow-up](borrowed-spans.md) implements the stable-descriptor candidate and measures its additional gains against this round's optimized build.

The changes reduce measured parsing time in all 16 cases in the 64 KiB matrix. Full event decoding takes 23.4% less time on the bundled XML, 32.1% less on attribute-heavy input, and 40.4% less on long ASCII text. Unicode input also improves after correcting an inlining regression discovered during iteration. These are local measurements on Node 24.11.1, macOS arm64; browser-engine performance remains unmeasured.

## Project goals and constraints

The README, Rust state machine, streaming tests, and JS API establish these priorities:

- Parse UTF-8 byte streams containing XML, HTML, JSX, and Angular-style attributes without building a DOM.
- Emit selected SAX events, with byte offsets and line/UTF-16 column positions usable by language tools.
- Allow partial tags, values, and UTF-8 sequences across writes.
- Decode event fields lazily in JS and retain their Rust backing data through the current write. Persisted data uses `toJSON()`.
- Keep memory tied to the current chunk and parser state, rather than the whole document. This is a permissive parser, not a validating XML parser.

The existing benchmark subscribes to zero events. That is useful for the parser core, but it misses costs paid by consumers that inspect names, positions, attributes, or complete event objects. In the baseline, the bundled XML takes about 6.8 ms without events and 65 ms when selected events are fully materialized. That difference includes Rust event retention, callbacks, JS allocation, field reads, and string decoding; it is not an isolated measurement of FFI call overhead.

## Implemented changes

### Bounded SIMD scanning

`GraphemeClusters` skips ASCII spans 16 bytes at a time while searching for text, name, and attribute-value delimiters. SIMD stops at any delimiter, newline, or high-bit byte. The original scalar path handles UTF-8, newline accounting, short tails, and incomplete code points.

Every vector load is guarded by at least 16 remaining input bytes. There are no padded-buffer assumptions or reads beyond the input slice. Unaligned Wasm loads are used. The first block selects an ASCII or scalar specialization, and the surrounding scan methods explicitly inline into their parser callers. The SIMD loop stays separate to control duplication. Native builds use the scalar implementation, enabling the Rust unit and documentation tests on this host.

The first prototype helped ASCII input but made Unicode parsing more than twice as slow. A Unicode fallback alone did not fix that. Explicit inlining of the scan methods restored specialization of constant delimiter sets and eliminated the regression. The retained version improves the Unicode fixture as well as ASCII fixtures.

### Fewer Rust allocations and copies

- Closing names entirely contained in the current write are borrowed directly from input for matching. Names accumulated across writes continue through the existing owned-buffer path.
- Text is boxed only when a Text event will actually retain it. Previously even unobserved text allocated a box, and a CloseTag text-node clone involved another temporary box.
- An Attribute event moves its completed attribute into retained storage when neither OpenTag nor CloseTag requires a separate copy.
- Self-closing OpenTag and CloseTag callbacks share one immutable retained tag allocation. The tag never enters the stack, so duplicate deep clones are unnecessary. Its backing allocation remains live through the write.

No Rust struct layout was changed. Existing event masks, callbacks, and ownership of partial parser state are retained.

### JS readers and memory access

Built-in event readers now receive a numeric linear-memory offset and read fields through a shared `DataView`. This removes per-entity struct `Uint8Array` allocations. Whole-memory byte views are shared per `WebAssembly.Memory`, rather than allocated by each reader that decodes a string. Nested Attribute and processing-instruction readers are constructed when accessed.

Reads still specify little-endian encoding and combine two u32 words for u64 values, preserving the existing number-based API. Empty Text strings are cached. The exported standalone integer helpers remain available. Public reader constructors still accept `Uint8Array` struct bytes, including copied structs whose string pointers refer to Wasm memory.

Unshared-memory growth detaches the old buffer, allowing a cheap byte-length check on the hot path. Shared-memory readers check the current buffer identity because old shared views remain attached. Tests cover both forms of growth, delayed nested reads, copied headers, unaligned reads, values above 2^32, and retained self-closing events.

The module now declares its `event_listener` import from `env` explicitly. The installed nightly linker otherwise rejected a rebuild before any optimization could be measured.

## Measurements

Both binaries were rebuilt from source with Rust 1.101.0-nightly (`c1070d693`, 2026-09-28), the same release settings, SIMD enabled, and Binaryen 125 at `-O4`. The baseline is the starting implementation with the import declaration needed by this toolchain, rather than the older checked-in binary. JS artifacts were built with the same installed TypeScript compiler. Node uses V8 13.6.233.10-node.28.

The harness compiles and instantiates outside timing, constructs fixtures/chunk views outside timing, warms both parsers, alternates execution order, and reports medians. Parsing and `end()` are timed. Event counts and field checksums must agree on every iteration. Full value-by-value equivalence is checked separately.

- `none`: no subscribed events.
- `callback`: OpenTag, CloseTag, Text, and Attribute, with callbacks counting events.
- `read`: the same events; inspect strings, positions, and byte offsets.
- `json`: the same events; call `toJSON()` for complete nested materialization.

Synthetic text and attribute fixtures are approximately 2 MiB; the Unicode fixture has more encoded bytes because it contains multibyte characters. The bundled XML is about 3 MB. Exact sizes, samples, and checksums are in [performance-results.json](performance-results.json).

64 KiB chunks, 10 warmups and 25 measured parses per build per case:

| Input | Mode | Baseline ms | Updated ms | Less elapsed time |
|---|---|---:|---:|---:|
| xml | none | 6.839 | 6.174 | 9.7% |
| xml | callback | 24.490 | 20.208 | 17.5% |
| xml | read | 39.884 | 33.459 | 16.1% |
| xml | json | 64.935 | 49.734 | 23.4% |
| text | none | 1.061 | 0.290 | 72.7% |
| text | callback | 1.561 | 0.710 | 54.5% |
| text | read | 2.071 | 1.195 | 42.3% |
| text | json | 2.650 | 1.579 | 40.4% |
| attributes | none | 2.373 | 1.250 | 47.3% |
| attributes | callback | 9.555 | 5.064 | 47.0% |
| attributes | read | 15.425 | 10.555 | 31.6% |
| attributes | json | 33.113 | 22.483 | 32.1% |
| unicode | none | 1.689 | 1.517 | 10.2% |
| unicode | callback | 4.566 | 3.896 | 14.7% |
| unicode | read | 12.426 | 11.277 | 9.3% |
| unicode | json | 22.561 | 19.851 | 12.0% |

A second run at 4 KiB confirms the improvements with more frequent writes. It uses 8 warmups and 15 measured parses; the complete matrix is in [performance-results-4k.json](performance-results-4k.json).

| Input, full decoding | Baseline ms | Updated ms | Less elapsed time |
|---|---:|---:|---:|
| xml | 65.899 | 50.747 | 23.0% |
| text | 2.862 | 1.659 | 42.0% |
| attributes | 34.097 | 23.048 | 32.4% |
| unicode | 23.685 | 20.161 | 14.9% |

The optimized Wasm grows from 40,869 to 48,598 bytes, about 19%, largely because of explicit scan inlining/specialization. That is the measured throughput tradeoff. Startup latency and browser engines were not benchmarked. Percentages above are reductions in elapsed time, not percentages added to throughput.

## Verification

- `npm run build`: ESM, CJS, declarations, and optimized Wasm build successfully.
- `npm test -- --runInBand --coverage=false`: 63 tests across 11 suites pass.
- `CARGO_ENCODED_RUSTFLAGS='' cargo test --target aarch64-apple-darwin`: 35 unit tests and 11 doc tests pass.
- ESLint on the modified wrapper and new memory tests passes.
- `scripts/verify-performance.mjs`: 191,488 complete event traces equal the baseline. It exercises all 1,024 event masks, 17 fixtures, and 11 chunk layouts, including one-byte writes, SIMD boundaries, UTF-8 splits, multiline quoted values, JSX, comments, CDATA, declarations, nested and orphan tags.

Differential tests establish that optimization preserves baseline behavior on these inputs; they do not establish standards compliance or correct every pre-existing streaming edge case. Event data still has the documented temporary lifetime. A refreshed memory view does not keep a freed Rust event alive after another write.

## Prior art and remaining strong candidates

The [Rust/Wasm book](https://rustwasm.github.io/book/game-of-life/implementing.html) describes exposing linear-memory structures through handles to reduce serialization and copying. That fits this project's pointer-based event interface. The changes remove intermediate JS views and some Rust copies while retaining this interface.

[simdjson's On-Demand design](https://github.com/simdjson/simdjson/blob/master/doc/ondemand_design.md) emphasizes processing values as they are consumed and controlling memory pressure. That supports making nested JS readers lazy. SAX still scans the entire input; this change does not turn it into an On-Demand parser.

[V8's DataView work](https://v8.dev/blog/dataview) documents optimized little-endian binary reads. The wrapper keeps those reads and removes surrounding allocation/repeated buffer lookup. Replacing every integer read with bytewise arithmetic or BigInt is not supported by these measurements.

[Emscripten's interop documentation](https://emscripten.org/docs/porting/connecting_cpp_and_javascript/Interacting-with-code.html) describes direct typed-array access to linear memory and the need to refresh views after memory grows. The shared-view cache implements that lifetime constraint.

The next candidates, based on the remaining work in this code, are:

| Candidate | Expected benefit | Required design work |
|---|---|---|
| Stable event descriptors with borrowed spans | Avoid hydrating/cloning strings completed within a write | Use explicit `#[repr(C)]` pointer/length descriptors, preserve cross-write owned values, and pin source storage until readers expire. Do not disguise borrowed storage as an owning `Vec`. |
| Reusable chunk event arena | Reduce per-event box allocation and improve locality | Allocate stable slabs that do not move on growth; reset only after the previous write's readers expire. A growing ordinary `Vec<Entity>` would invalidate exposed pointers. |
| Batched event dispatch | Reduce Wasm-to-JS transitions for dense event streams | Retain records in order, deliver after parsing the write, and preserve callback timing expectations or expose a separate batch API. Existing subscribers may change behavior during a callback. |
| Allocated input buffer and direct producer writes | Remove the JS-to-Wasm copy for compatible producers | Reserve a heap-owned buffer and allow producers such as `TextEncoder.encodeInto` or native reads to fill it directly. Arbitrary JS-owned chunks still require a copy. Handle overlap, growth, and input/event lifetimes explicitly. |
| Separate minimal stack records from event snapshots | Avoid retaining attributes/positions needed only by OpenTag consumers | Preserve close-name matching, malformed nesting behavior, event-mask changes between writes, and complete CloseTag data where requested. |

These are research candidates, not claimed benchmark wins. Input staging still copies bytes into Wasm; decoding a string still allocates a JS string. The project is not wholly zero-copy after this change.

A prerequisite for deeper FFI changes is an explicit stable ABI. JS currently assumes the layout of Rust `Vec` fields inside event structs. [Rust's Vec documentation](https://doc.rust-lang.org/std/vec/struct.Vec.html#guarantees) explicitly leaves field order and ABI unspecified. A C-layout outer struct does not stabilize nested Vec layout. This investigation preserves the existing tested layouts; a descriptor ABI would remove that compiler-version dependency while enabling more borrowing.

## Reproducing

A baseline directory must contain its built `lib/esm/*.js`, `lib/esm/package.json`, and `lib/sax-wasm.wasm`. The local starting-source build is saved at `/tmp/sax-perf-baseline`; it is a temporary snapshot, not a tracked build dependency. Recreate it from the starting revision before applying these changes if that directory is gone, using the same compiler/optimizer and explicit Wasm import declaration.

```sh
npm run build
node scripts/benchmark-performance.mjs --baseline /tmp/sax-perf-baseline --rounds 25 --warmups 10 --output docs/performance-results.json
node scripts/benchmark-performance.mjs --baseline /tmp/sax-perf-baseline --chunk-size 4096 --output docs/performance-results-4k.json
node scripts/verify-performance.mjs --baseline /tmp/sax-perf-baseline
```

Without `--baseline`, the benchmark measures the current build alone. Run timing comparisons without simultaneous builds, tests, or profiling. Pre-existing package/dependency edits were left intact; generated parser artifacts reflect the optimized source.
