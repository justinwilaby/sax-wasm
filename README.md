# SAX (Simple API for XML) for WebAssembly

![Rust Build Status](https://github.com/justinwilaby/sax-wasm/actions/workflows/rust.yml/badge.svg)
[![TS Build Status](https://github.com/justinwilaby/sax-wasm/actions/workflows/ci.yaml/badge.svg)](https://github.com/justinwilaby/sax-wasm/actions/workflows/ci.yaml)

*When you absolutely, positively have to have the fastest parser in the room, accept no substitutes.*

## Quickstart

- Works in Node (>=18.20.5) and modern browsers. Install with `npm i sax-wasm`.
- Initialize `SAXParser`, load the packaged `lib/sax-wasm.wasm`, and stream bytes via a reader.

Node (ESM):
```js
import { readFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { SaxEventType, SAXParser } from 'sax-wasm';

const wasmUrl = new URL('sax-wasm/lib/sax-wasm.wasm', import.meta.url);
const wasmBytes = await readFile(wasmUrl);

const parser = new SAXParser(SaxEventType.Text | SaxEventType.OpenTag);
await parser.prepareWasm(wasmBytes);

const xmlUrl = new URL('./example.xml', import.meta.url);
const webStream = Readable.toWeb(createReadStream(xmlUrl));
for await (const [event, detail] of parser.parse(webStream.getReader())) {
  // handle events
}
```

Browser:
```js
import { SaxEventType, SAXParser } from 'sax-wasm';

const parser = new SAXParser(SaxEventType.Attribute | SaxEventType.OpenTag);
await parser.prepareWasm(fetch(new URL('sax-wasm/lib/sax-wasm.wasm', import.meta.url)));

const res = await fetch('/document.xml');
for await (const [event, detail] of parser.parse(res.body.getReader())) {
  // handle events
}
```

Note: `prepareWasm` accepts `Uint8Array | Response | Promise<Response>`.

TypeScript note (Node 20+/22): `SAXParser.parse` expects a `ReadableStreamDefaultReader<Uint8Array>`.
Node's `Readable.toWeb()` often produces a `ReadableStream<any>`, so the generic type is lost.
You can either type the stream or cast the reader:

```ts
// Option A: type the stream
const webStream = Readable.toWeb(createReadStream(xmlUrl)) as ReadableStream<Uint8Array>;
for await (const [event, detail] of parser.parse(webStream.getReader())) {
  // ...
}

// Option B: cast the reader
for await (const [event, detail] of parser.parse(
  webStream.getReader() as ReadableStreamDefaultReader<Uint8Array>
)) {
  // ...
}
```

## Table of contents

- [Installation](#installation)
- [Usage in Node (ESM)](#usage-in-node-esm)
- [Usage for the web](#usage-for-the-web)
- [Events](#events)
- [Whitespace handling](#whitespace-handling)
- [Entity start and end positions](#entity-start-and-end-positions)
- [The 'lifetime' of events](#the-lifetime-of-events)
- [Differences from other parsers](#differences-from-other-parsers)
- [Streaming](#streaming)
- [Speeding things up on large documents](#speeding-things-up-on-large-documents)
- [SAXParser (JavaScript/TypeScript)](#saxparser-javascripttypescript)
- [sax-wasm.wasm](#sax-wasmwasm)
- [Benchmarks](#benchmarks-node-v22200--macos-arm64)
- [Building from source](#building-from-source)

The first streamable, low memory XML, HTML, JSX and Angular Template parser for [WebAssembly](https://developer.mozilla.org/en-US/docs/WebAssembly).

Sax Wasm is a sax style parser for XML, HTML, JSX and Angular Templates written in [Rust](https://www.rust-lang.org/en-US/), compiled for
WebAssembly with the sole motivation to bring the **fastest possible speeds** to XML and JSX parsing for node and the web.
Inspired by [sax js](https://github.com/isaacs/sax-js) and rebuilt with Rust for WebAssembly, sax-wasm brings optimizations
for speed and support for JSX syntax.

Suitable for [LSP](https://langserver.org/) implementations, sax-wasm provides line numbers and character positions within the
document for elements, attributes and text node which provides the raw building blocks for linting, transpilation and lexing.

## Entity start and end positions

The `sax-wasm` parser provides precise location information for each entity encountered during the parsing process. Here's how you can access and utilize this information:

### Entity types

- **Elements**: Both opening and closing tags.
- **Attributes**: Within elements.
- **Text**: Text content, CDATA, Entities, etc.
- **ProcInst**: Processing instructions.

### Position data

For each entity, `sax-wasm` returns a `Position` object:

- **Start and End Positions**: Objects with:
  - `line`: The line number where the entity begins.
  - `character`: The column or "character" number where the entity begins.

The position data 100% works with `xml.substring(start, end)` or `xml.slice(start, end)` and takes into account 2–4 byte graphemes such as emojis, Cyrillic, or UTF‑16 encoded documents.

### Byte offset ranges

In addition to line and character positions, `sax-wasm` now provides byte offset ranges for all entities. This allows for precise byte-level access to the original data:

- **Byte Offsets**: Each entity includes `byteOffsets` with:
  - `start`: The starting byte position in the original data
  - `end`: The ending byte position in the original data

This is particularly useful for:
- Direct byte-level manipulation of the source data
- Precise substring extraction without character encoding concerns
- Performance-critical applications that need byte-accurate positioning

### Attribute types

The parser distinguishes between different attribute syntax types (see `AttributeType` in `src/js/saxWasm.ts`):

- **NoValue**: Attribute with no value (e.g. `disabled`)
- **JSX**: JSX-style attributes (e.g. `prop={expression}`)
- **NoQuotes**: Unquoted attributes (e.g. `attr=value`)
- **SingleQuoted**: Single-quoted attributes (e.g. `attr='value'`)
- **DoubleQuoted**: Double-quoted attributes (e.g. `attr="value"`)

This information is available in the `type` field of each attribute and can be used for syntax highlighting, linting, or format‑specific processing.

#### Example Output

When parsing `<div class="myDiv">This is my div</div>`, you might receive output like this:

Preview:
```jsonc
{
  "openStart": { "line": 0, "character": 0 },
  "openEnd":   { "line": 0, "character": 19 },
  "closeStart":{ "line": 0, "character": 33 },
  "closeEnd":  { "line": 0, "character": 39 },
  "name": "div",
  "attributes": [ { "name": { "value": "class" }, "value": { "value": "myDiv" } } ],
  "textNodes": [ { "value": "This is my div" } ],
  "selfClosing": false
}
```

Full details:
<details>
<summary>Show full example</summary>

```jsonc
{
  "openStart": {
    "line": 0,
    "character": 0
  },
  "openEnd": {
    "line": 0,
    "character": 19
  },
  "closeStart": {
    "line": 0,
    "character": 33
  },
  "closeEnd": {
    "line": 0,
    "character": 39
  },
  "name": "div",
  "attributes": [
    {
      "name": {
        "start": {
          "line": 0,
          "character": 5
        },
        "end": {
          "line": 0,
          "character": 10
        },
        "value": "class",
        "byteOffsets": {
          "start": 5,
          "end": 10
        }
      },
      "value": {
        "start": {
          "line": 0,
          "character": 12
        },
        "end": {
          "line": 0,
          "character": 17
        },
        "value": "myDiv",
        "byteOffsets": {
          "start": 12,
          "end": 17
        }
      },
      "type": 8, // AttributeType.DoubleQuoted
      "byteOffsets": {
        "start": 5,
        "end": 17
      }
    }
  ],
  "textNodes": [
    {
      "start": {
        "line": 0,
        "character": 19
      },
      "end": {
        "line": 0,
        "character": 33
      },
      "value": "This is my div",
      "byteOffsets": {
        "start": 19,
        "end": 33
      }
    }
  ],
  "selfClosing": false,
  "byteOffsets": {
    "start": 0,
    "end": 39
  }
}
```

</details>

## Benchmarks (Node v22.20.0 / macOS arm64)
Benchmarks last updated: 2025‑11‑18. Reproduce locally with:

```bash
npm install
npm run build:wasm
npm run benchmark
```

The benchmark script (`src/js/__test__/benchmark.mjs`) streams the bundled `src/js/__test__/xml.xml` (≈3 MB) from memory to minimize disk variance and reports the mean over 10 runs.
Run recorded on Apple M4 Pro (Apple Silicon).

| Parser with Advanced Features                                                              | time/ms (lower is better)| JS     | Runs in browser |
|--------------------------------------------------------------------------------------------|-------------------------:|:------:|:---------------:|
| [sax-wasm](https://github.com/justinwilaby/sax-wasm)                                       |                     6.85 | ☑      | ☑               |
| [saxes](https://github.com/lddubeau/saxes)                                                 |                    11.19 | ☑      | ☑               |
| [ltx(using Saxes as the parser)](https://github.com/xmppjs/ltx)                            |                    11.77 | ☑      | ☑               |
| [sax-js](https://github.com/isaacs/sax-js)                                                 |                    29.58 | ☑      | ☑*              |
| [node-xml](https://github.com/dylang/node-xml)                                             |                    40.19 | ☑      | ☐               |
| [node-expat](https://github.com/xmppo/node-expat)                                          |                    40.93 | ☑      | ☐               |
<sub>*built for node but *should* run in the browser</sub>

## Installation
Install once, then jump back to Quickstart for minimal usage:
```bash
npm i sax-wasm
```
Supports Node (>=18.20.5) with both ESM and CJS entry points and modern browsers.

## Usage in Node (ESM)
```js
import { readFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { SaxEventType, SAXParser } from 'sax-wasm';

// Locate the WASM file from the package
const wasmUrl = new URL('sax-wasm/lib/sax-wasm.wasm', import.meta.url);
const wasmBytes = await readFile(wasmUrl);

const parser = new SAXParser(SaxEventType.Cdata | SaxEventType.OpenTag);
if (await parser.prepareWasm(wasmBytes)) {
  const xmlUrl = new URL('../src/xml.xml', import.meta.url);
  const nodeStream = createReadStream(xmlUrl);
  const webStream = Readable.toWeb(nodeStream);

  for await (const [event, detail] of parser.parse(webStream.getReader())) {
    if (event === SaxEventType.Cdata) {
      // process Cdata
    } else {
      // process open tag
    }
  }
}
```

CommonJS:
```js
const { readFileSync, createReadStream } = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const { SaxEventType, SAXParser } = require('sax-wasm');

async function run() {
  const wasmPath = require.resolve('sax-wasm/lib/sax-wasm.wasm');
  const parser = new SAXParser(SaxEventType.Text | SaxEventType.OpenTag);
  await parser.prepareWasm(readFileSync(wasmPath));

  const xmlPath = path.resolve(__dirname, './example.xml');
  const webStream = Readable.toWeb(createReadStream(xmlPath));

  for await (const [event, detail] of parser.parse(webStream.getReader())) {
    // handle events
  }
}

run();
```
## Usage for the web
1. Instantiate and prepare the wasm for parsing
2. Pipe the document stream to sax-wasm using [ReadableStream.getReader()](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream/getReader)

**NOTE** This uses [WebAssembly.instantiateStreaming](https://developer.mozilla.org/en-US/docs/WebAssembly/JavaScript_interface/instantiateStreaming)
under the hood to load the wasm.
```js
import { SaxEventType, SAXParser } from 'sax-wasm';

// Fetch and instantiate the WebAssembly binary
const wasmUrl = new URL('sax-wasm/lib/sax-wasm.wasm', import.meta.url);
const parser = new SAXParser(SaxEventType.Attribute | SaxEventType.OpenTag);

const ready = await parser.prepareWasm(fetch(wasmUrl));
if (ready) {
  // Fetch the XML document
  const xmlResponse = await fetch('/path/to/document.xml');
  const reader = xmlResponse.body.getReader();

  for await (const [event, detail] of parser.parse(reader)) {
    if (event === SaxEventType.Attribute) {
      // process attribute
    } else {
      // process open tag
    }
  }
}
```
## The 'lifetime' of events
`Tag`, `Attribute`, `ProcInst` and `Text` objects received from the parsing operation have a 'lifetime' that is limited to the `eventHandler()` or the function loop body for the `*parse()` generator. Data sent across the FFI (Foreign Function Interface) boundary is read directly from WASM memory which is partly why sax-wasm is so fast. This comes with the tradeoff that this memory is temporary because it is overwritten on the next write operation. If you need to persist the event data for long term use, call `toJSON()` on each object as needed. This comes at a slight performance cost and should not be necessary for the vast majority of use cases.

## Differences from other parsers

| Feature / Behavior | sax-wasm stance |
|--------------------|-----------------|
| Maintenance | Actively maintained |
| Encoding | UTF‑8/UTF‑16; 1–4 byte graphemes preserved even across chunk boundaries |
| JSX | Supported (including fragments) |
| Angular templates | Supported (e.g., bindings, structural directives, event handlers) |
| HTML | Supported (non-quirks mode) |
| Validation | Non-validating; emits what it sees—apply your own rules for strict mode |
| Namespaces | Reported in attributes; no dedicated namespace events |
| Streaming input | Requires streaming UTF‑8 bytes (`Uint8Array`) |
| Inter-element whitespace | Not emitted; infer via positions or enable `Text` and filter |
| Byte offsets | Provided for all entities for direct byte slicing |
| Attribute types | Reported (no‑value, JSX, unquoted, single, double quoted) |

## Streaming
Streaming is supported with sax-wasm by writing utf-8 code points (Uint8Array) to the parser instance. Writes can occur safely
anywhere except within the `eventHandler` function or within the `eventTrap` (when extending `SAXParser` class).
Doing so anyway risks overwriting memory still in play.

## Events
Events are subscribed to using a bitmask composed from flags representing the event type.
For example, passing in the following bitmask to the parser instructs it to emit events for Text, OpenTag and Attribute:
```js
import { SaxEventType } from 'sax-wasm';
parser.events = SaxEventType.Text | SaxEventType.OpenTag | SaxEventType.Attribute;
```
Complete list of event/argument pairs:

|Event                             |Mask          | Argument passed to handler    |
|----------------------------------|--------------|--------------------------------|
|SaxEventType.Text                 |0b1           | `text: Text`                  |
|SaxEventType.ProcessingInstruction|0b10          | `procInst: ProcInst`          |
|SaxEventType.Declaration          |0b100         | `declaration: Text`           |
|SaxEventType.Doctype              |0b1000        | `doctype: Text`               |
|SaxEventType.Comment              |0b10000       | `comment: Text`               |
|SaxEventType.OpenTagStart         |0b100000      | `tag: Tag`                    |
|SaxEventType.Attribute            |0b1000000     | `attribute: Attribute`        |
|SaxEventType.OpenTag              |0b10000000    | `tag: Tag`                    |
|SaxEventType.CloseTag             |0b100000000   | `tag: Tag`                    |
|SaxEventType.Cdata                |0b1000000000  | `text: Text`                  |

Note: In prose you may see “CDATA”, but the enum value is spelled `Cdata`.

### Whitespace handling
Whitespace-only text nodes between elements are intentionally not emitted to keep streaming performance high. If you need to account for inter-element whitespace, compare the `line`/`character` positions of consecutive tags to infer gaps.

## Speeding things up on large documents
| Concern | Do this | Why it helps |
|---------|---------|--------------|
| Input format | Stream `Uint8Array` bytes directly (avoid loading XML as string and re-encoding) | Skips JS-side encoding overhead; parser often finishes as the download ends |
| Events requested | Keep the `events` bitmask minimal | Less JS work per callback, fewer conversions |
| Property access | Read only what you need; avoid bulk `JSON.stringify()` | First access performs the costly decode; later reads are cached |
| Data extraction | Prefer `byteOffsets` over character positions when slicing | Avoids encoding conversions; direct byte-level access |
| Chunking | Stream in chunks; don’t buffer the whole document | Keeps memory and latency low |

## SAXParser (JavaScript/TypeScript)
## Constructor
`new SAXParser(events?: number)`

Constructs a new SAXParser instance with the specified events bitmask.
### Parameters

- `events` - A number representing a bitmask of events that should be reported by the parser.

### Methods

- `prepareWasm(wasm: Uint8Array | Response | Promise<Response>): Promise<boolean>` – Instantiates the WASM module with reasonable defaults and stores the instance as a member of the class. Resolves to `true` or throws if something went wrong.

- `write(chunk: Uint8Array): void` – Writes the supplied bytes to the WASM memory buffer and kicks off processing. **NOTE:** The `line` and `character` counters are not reset between writes.

- `end(): void` – Ends processing for the stream. The `line` and `character` counters are reset to zero and the parser is readied for the next document.

### Properties

- `events` - A bitmask containing the events to subscribe to. See the examples for creating the bitmask

- `eventHandler` - A function reference used for event handling. The supplied function must have a signature that accepts
2 arguments: 1. The `event` which is one of the `SaxEventTypes` and the `body` (listed in the table above)

## sax-wasm.wasm
### Methods

The methods listed here can be used to create your own implementation of the SaxWasm class when extending it or composing
it will not meet the needs of the program.
- `parser(events: u32)` - Prepares the parser struct internally and supplies it with the specified events bitmask. Changing
the events bitmask can be done at *anytime* during processing using this method.

- `write(ptr: *mut u8, length: usize)` - Supplies the parser with the location and length of the newly written bytes in the
stream and kicks off processing. The parser assumes that the bytes are valid utf-8 grapheme clusters. Writing non utf-8 bytes may cause
unpredictable results but probably will not break.

- `end()` - resets the `character` and `line` counts but does not halt processing of the current buffer.

## Building from source
### Prerequisites

This project targets the Rust stable toolchain with the `wasm32-unknown-unknown` target enabled.

Install rust and the wasm target:
```bash
curl https://sh.rustup.rs -sSf | sh
rustup install stable
rustup default stable
rustup target add wasm32-unknown-unknown --toolchain stable
```

Install [node with npm](https://nodejs.org/en/), then from the project root:
```bash
npm install
cargo install wasm-bindgen-cli
```

Build artifacts (JS, types, wasm) land in `lib/`:
```bash
npm run build
```
