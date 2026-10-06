# Borrowed spans within one write — 2026-10-06

Completed strings now use spans into the current Wasm input instead of being hydrated into Rust byte vectors and deep-cloned into event objects. Immutable event descriptors retain metadata at stable addresses. Strings accumulated across writes retain owned backing storage. This builds on the [first optimization round](performance.md); every baseline below is that round's already optimized build.

At 64 KiB, callback-only parsing takes another 10.7–18.9% less time on XML, long text, attributes, and Unicode. XML full decoding takes 6.6% less time. The 4 KiB run confirms callback gains, with smaller gains when strings and nested objects are decoded. These are local Node measurements, not browser results or statistical confidence intervals.

## Ownership and lifetime

- Tag names, attribute names/values, text, comments, CDATA, doctypes, and processing-instruction fields completed in the current write can point directly into its input bytes. Syntax delimiters are removed by adjusting spans.
- Values with an owned prefix from earlier writes use owned event storage. Persistent parser state is still hydrated at the write boundary so later writes can overwrite the input safely.
- Event records and nested descriptor arrays are individually boxed. Bookkeeping vectors may grow without moving exposed records. Self-closing OpenTag and CloseTag share one immutable snapshot. Subscriptions are captured for that tag, preserving the measured baseline behavior when a callback changes the mask; the next tag observes the change.
- If a write joins a split UTF-8 prefix with the incoming bytes, the combined buffer is retained until readers expire. Dropping that temporary buffer when `write()` returned would invalidate borrowed spans.
- Records are released on the next write or reset. JS readers retain the existing temporary lifetime; use `toJSON()` to persist values. Memory-growth-aware views remain necessary.

This removes Rust string copies on the eligible path. Input staging still copies JS-owned bytes into Wasm, and decoding still creates JS strings. Metadata still allocates; an event arena or batched callbacks would be separate candidates. Native Rust handlers default to the existing owned event path.

## Event descriptor ABI

The Wasm export `event_abi_version()` returns `1`. Its import is `env.event_listener_v1(event, ptr)`. Descriptors use explicit `#[repr(C)]` scalar fields and compile-time size/offset assertions; they do not expose Rust `Vec` layout. All pointers are u32 linear-memory offsets. A span contains a u32 pointer followed by a u32 length. String lengths count bytes; list lengths count descriptors. Positions and byte ranges use pairs of little-endian u64 values.

| Descriptor | Bytes | Field offsets |
|---|---:|---|
| Text | 56 | value span 0; start 8; end 24; byte range 40 |
| Attribute | 136 | name Text 0; value Text 56; type u32 112; reserved 116; byte range 120 |
| Tag | 112 | name span 0; attributes span 8; textNodes span 16; selfClosing u32 24; reserved 28; openStart 32; openEnd 48; closeStart 64; closeEnd 80; byte range 96 |
| ProcInst | 160 | start 0; end 16; target Text 32; content Text 88; byte range 144 |

The updated wrapper supplies both callback imports and detects the optional version export. It supports the new ABI and older binaries. An older wrapper fails to instantiate the new binary because it lacks the versioned import, preventing silent layout corruption. Direct callers must keep input bytes allocated and unchanged until the next write/reset. Public field values, event order, and serialization preserve baseline behavior, including existing offset semantics. Manually constructed JS readers default to the legacy layout; their optional third constructor argument selects descriptors.

## Measurements

Node 24.11.1 / V8 13.6.233.10-node.28, macOS arm64; Rust 1.101.0-nightly (`c1070d693`) and Binaryen 125, same release build settings for both binaries. The harness warms both parsers, alternates execution order, and measures parsing plus `end()`; compilation, fixture allocation, and memory-page reads are outside timing. Every iteration checks event counts and field checksums.

`none` subscribes to no events; `callback` counts events; `read` inspects strings/positions/offsets; `json` materializes complete nested objects. All observed modes subscribe to OpenTag, CloseTag, Text, and Attribute. The markup fixture additionally subscribes to Comment, Cdata, ProcessingInstruction, and Doctype.

64 KiB writes, 10 warmups and 25 measured parses per build; percentages are reductions in elapsed time. Negative values mean a regression.

| Input | Mode | Baseline ms | Updated ms | Less time |
|---|---|---:|---:|---:|
| xml | none | 6.174 | 6.156 | 0.3% |
| xml | callback | 20.114 | 16.427 | 18.3% |
| xml | read | 33.946 | 29.965 | 11.7% |
| xml | json | 50.363 | 47.057 | 6.6% |
| text | none | 0.284 | 0.312 | -9.7% |
| text | callback | 0.714 | 0.638 | 10.7% |
| text | read | 1.231 | 1.139 | 7.4% |
| text | json | 1.608 | 1.497 | 6.9% |
| attributes | none | 1.247 | 1.274 | -2.2% |
| attributes | callback | 5.083 | 4.122 | 18.9% |
| attributes | read | 10.637 | 9.778 | 8.1% |
| attributes | json | 22.597 | 22.095 | 2.2% |
| unicode | none | 1.453 | 1.482 | -2.0% |
| unicode | callback | 3.855 | 3.190 | 17.2% |
| unicode | read | 11.086 | 10.460 | 5.6% |
| unicode | json | 19.587 | 19.124 | 2.4% |
| markup | none | 1.724 | 1.401 | 18.7% |
| markup | callback | 3.699 | 3.433 | 7.2% |
| markup | read | 6.826 | 6.631 | 2.8% |
| markup | json | 7.729 | 7.471 | 3.3% |

4 KiB writes, 8 warmups and 15 measured parses per build:

| Input | Callback less time | Full decoding baseline ms | Updated ms | Full decoding less time |
|---|---:|---:|---:|---:|
| xml | 16.1% | 51.322 | 48.076 | 6.3% |
| text | 5.1% | 1.641 | 1.590 | 3.2% |
| attributes | 16.0% | 23.021 | 22.526 | 2.1% |
| unicode | 11.9% | 19.442 | 19.278 | 0.8% |
| markup | 7.9% | 7.858 | 7.687 | 2.2% |

The strongest evidence is the repeatable callback improvement across write sizes. Small decoding differences, particularly 0.8% on Unicode at 4 KiB, should be treated as marginal. No-event attribute and Unicode cases at 64 KiB regress by about 2%; no-event text regressed by about 0.028 ms at 64 KiB and 0.006 ms at 4 KiB. Markup parsing without events improves because eligible markup avoids hydration too.

Wasm size grows from 48,598 to 54,122 bytes (11.4%). At 64 KiB, the observed workloads finish with fewer allocated linear-memory pages: XML 2,555,904 → 1,835,008 bytes; text 1,310,720 → 1,179,648; attributes 1,572,864 → 1,376,256; Unicode 1,507,328 → 1,376,256; markup 1,310,720 → 1,245,184. These are final linear-memory sizes/high-water marks, not live allocation counts or JS heap measurements. The no-event Unicode case grows from 1,310,720 to 1,507,328 bytes because combined input capacity is retained. Other no-event fixtures have equal final sizes. Startup latency and browser performance remain unmeasured.

Raw samples, exact fixture sizes, checksums, and memory sizes: [64 KiB results](borrowed-spans-results.json), [4 KiB results](borrowed-spans-results-4k.json).

## Verification and reproduction

- Build succeeds for Wasm, ESM, CJS, and TypeScript declarations. ESLint and `git diff --check` pass.
- 70 JavaScript tests, 35 native Rust unit tests, and 11 Rust documentation tests pass.
- 450,560 complete event traces match: 20 fixtures × 11 chunk layouts × 1,024 event masks, comparing both the new pair and new-wrapper/old-binary pair against the baseline. The verifier also checks that an old wrapper rejects the new binary.
- Additional comparisons and unit tests cover enabling and disabling CloseTag during a self-closing OpenTag callback.
- Direct-pointer tests prove eligible strings reference input, rather than merely producing equal output. Tests cover owned cross-write fallback, immutable metadata after tag mutation/removal, deferred reads, descriptor-vector growth, Wasm memory growth, and split UTF-8 input lifetime.

Differential equivalence preserves existing behavior on the tested inputs; it does not establish standards compliance. The temporary baseline snapshot `/tmp/sax-borrow-baseline` contains the first round's optimized wrapper/binary and saved Rust/TS sources. It is not a tracked build dependency. To reproduce, supply an equivalent built baseline directory containing `lib/esm/*.js`, `lib/esm/package.json`, and `lib/sax-wasm.wasm`:

```sh
npm run build
node scripts/verify-performance.mjs --baseline /tmp/sax-borrow-baseline --legacy-compat
node scripts/benchmark-performance.mjs --baseline /tmp/sax-borrow-baseline --rounds 25 --warmups 10 --output docs/borrowed-spans-results.json
node scripts/benchmark-performance.mjs --baseline /tmp/sax-borrow-baseline --chunk-size 4096 --output docs/borrowed-spans-results-4k.json
```
