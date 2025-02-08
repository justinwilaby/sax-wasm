# SAX (Simple API for XML) for WebAssembly

![Rust Build Status](https://github.com/justinwilaby/sax-wasm/actions/workflows/rust.yml/badge.svg)
[![TS Build Status](https://github.com/justinwilaby/sax-wasm/actions/workflows/ci.yaml/badge.svg)](https://github.com/justinwilaby/sax-wasm/actions/workflows/ci.yaml)

*When you absolutely, positively have to have the fastest parser in the room, accept no substitutes.*

The first streamable, low memory XML, HTML, JSX and Angular Template parser for [WebAssembly](https://developer.mozilla.org/en-US/docs/WebAssembly).

Sax Wasm is a sax style parser for XML, HTML, JSX and Angular Templates written in [Rust](https://www.rust-lang.org/en-US/), compiled for
WebAssembly with the sole motivation to bring the **fastest possible speeds** to XML and JSX parsing for node and the web.
Inspired by [sax js](https://github.com/isaacs/sax-js) and rebuilt with Rust for WebAssembly, sax-wasm brings optimizations
for speed and support for JSX syntax.

Suitable for [LSP](https://langserver.org/) implementations, sax-wasm provides line numbers and character positions within the
document for elements, attributes and text node which provides the raw building blocks for linting, transpilation and lexing.

## Entity Start and End Positions

The `sax-wasm` parser provides precise location information for each entity encountered during the parsing process. Here's how you can access and utilize this information:

### Entity Types

- **Elements**: Both opening and closing tags.
- **Attributes**: Within elements.
- **Text**: Text content, CDATA, Entities, etc.
- **ProcInst**: Processing instructions.

### Position Data

For each entity, `sax-wasm` returns a `Position` object:

- **Start and End Positions**: Objects with:
  - `line`: The line number where the entity begins.
  - `character`: The column or "character" number where the entity begins.

The position data 100% works with `xml.substring(start, end)` or `xml.slice(start, end)` and takes into account 2-4 byte graphemes such as emojis, cyrillic or utf-16 encoded documents.

#### Example Output

When parsing `<div class="myDiv">This is my div</div>`, you might receive output like this:

```js
{
  openStart: {
    line: 0,
    character: 0,
  },
  openEnd: {
    line: 0,
    character: 19,
  },
  closeStart: {
    line: 0,
    character: 33,
  },
  closeEnd: {
    line: 0,
    character: 39,
  },
  name: "div",
  attributes: [
    {
      name: {
        start: {
          line: 0,
          character: 5,
        },
        end: {
          line: 0,
          character: 10,
        },
        value: "class",
      },
      value: {
        start: {
          line: 0,
          character: 12,
        },
        end: {
          line: 0,
          character: 17,
        },
        value: "myDiv",
      },
      type: 0,
    },
  ],
  textNodes: [
    {
      start: {
        line: 0,
        character: 19,
      },
      end: {
        line: 0,
        character: 33,
      },
      value: "This is my div",
    },
  ],
  selfClosing: false,
}
```

## Benchmarks (Node v20.18.1 / 2.7 GHz Quad-Core Intel Core i7)
All parsers are tested using a large XML document (3 MB) containing a variety of elements and is streamed from memory to remove variations in disk access latency and focus on benchmarking just the parser alone. Other libraries test benchmarks using a very small XML fragment such as `<foo bar="baz">quux</foo>` which does not hit all code branches responsible for processing the document and heavily skews the results in their favor.

| Parser with Advanced Features                                                              | time/ms (lower is better)| JS     | Runs in browser |
|--------------------------------------------------------------------------------------------|-------------------------:|:------:|:---------------:|
| [sax-wasm](https://github.com/justinwilaby/sax-wasm)                                       |                    13.27 | ☑      | ☑               |
| [saxes](https://github.com/lddubeau/saxes)                                                 |                    41.01 | ☑      | ☑               |
| [ltx(using Saxes as the parser)](https://github.com/xmppjs/ltx)                            |                    44.56 | ☑      | ☑               |
| [sax-js](https://github.com/isaacs/sax-js)                                                 |                   116.98 | ☑      | ☑*              |
| [node-xml](https://github.com/dylang/node-xml)                                             |                   124.49 | ☑      | ☐               |
| [node-expat](https://github.com/xmppo/node-expat)                                          |                   149.61 | ☑      | ☐               |
<sub>*built for node but *should* run in the browser</sub>

## Installation
```bash
npm i -s sax-wasm
```
## Usage in Node
```js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SaxEventType, SAXParser } from 'sax-wasm';

const wasmUrl = new URL(import.meta.resolve('sax-wasm/lib/sax-wasm.wasm'));
const saxWasm = await readFile(wasmUrl);
const parser = new SAXParser(SaxEventType.Cdata | SaxEventType.OpenTag);

if (await parser.prepareWasm(saxWasm)) {
  const xmlPath = import.meta.resolve('../src/xml.xml');
  const readable = createReadStream(new URL(xmlPath));
  const webReadable = Readable.toWeb(readable);
  for await (const [event, detail] of parser.parse(webReadable.getReader())) {
    if (event === SaxEventType.Cdata) {
      // process Cdata
    } else {
      // process open tag
    }
  }
}
```
## Usage for the web
1. Instantiate and prepare the wasm for parsing
2. Pipe the document stream to sax-wasm using [ReadableStream.getReader()](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream/getReader)

**NOTE** This uses [WebAssembly.instantiateStreaming](https://developer.mozilla.org/en-US/docs/WebAssembly/JavaScript_interface/instantiateStreaming)
under the hood to load the wasm.
```js
import { SaxEventType, SAXParser } from 'sax-wasm';

// Fetch the WebAssembly binary
const wasmUrl = new URL(import.meta.resolve('sax-wasm/lib/sax-wasm.wasm'));
const response = fetch(wasmUrl);

// Instantiate
const parser = new SAXParser(SaxEventType.Attribute | SaxEventType.OpenTag);

// Instantiate and prepare the wasm for parsing
const ready = await parser.prepareWasm(response);
if (ready) {
  // Fetch the XML document
  const xmlResponse = await fetch('path/to/document.xml');
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
## The 'Lifetime' of events
`Tag`, `Attribute`, `ProcInst` and `Text` objects received from the parsing operation have a 'lifetime' that is limited to the `eventHandler()` or the function loop body for the `*parse()` generator. Data sent across the FFI (Foreign Function Interface) boundary is read directly from WASM memory which is partly why sax-wasm is so fast. This comes with the tradeoff that this memory is temporary because it is overwritten on the next write operation. If you need to persist the event data for long term use, call `toJSON()` on each object as needed. This comes at a slight performance cost and should not be necessary for the vast majority of use cases.

## Differences from other parsers
Besides being incredibly fast, there are some notable differences between other SAX style parsers:

1. This repo is maintained
1. UTF-16 encoded documents are supported. 1-4 byte graphemes are fully supported even if streaming causes a break between surrogates.
1. JSX is supported including JSX fragments. Things like `<foo bar={this.bar()}></bar>` and `<><foo/><bar/></>` will parse as expected.
1. Angular 2+ templates are supported. Things like <button type="submit" [disabled]=disabled *ngIf=boolean (click)="clickHandler(event)"></button> will parse as expected.
1. HTML is supported provided it is not a "quirks mode" document that ran in IE9.
1. No attempt is made to validate the document. sax-wasm reports what it sees. If you need strict mode or document validation, it may
be recreated by applying rules to the events that are reported by the parser.
1. Namespaces are reported in attributes. No special events dedicated to namespaces.
1. Streaming utf-8 code points in a Uint8Array is required.
1. Whitespace between XML elements is not reported. If you need this, a simple subtraction of the `line` and `character` between the end of one tag and the start of the next will reveal where this whitespace exists.

## Streaming
Streaming is supported with sax-wasm by writing utf-8 code points (Uint8Array) to the parser instance. Writes can occur safely
anywhere except within the `eventHandler` function or within the `eventTrap` (when extending `SAXParser` class).
Doing so anyway risks overwriting memory still in play.

## Events
Events are subscribed to using a bitmask composed from flags representing the event type.
Bit positions along a 12 bit integer can be masked on to tell the parser to emit the event of that type.
For example, passing in the following bitmask to the parser instructs it to emit events for text, open tags and attributes:
```js
import { SaxEventType } from 'sax-wasm';
parser.events = SaxEventType.Text | SaxEventType.OpenTag | SaxEventType.Attribute;
```
Complete list of event/argument pairs:

|Event                             |Mask          | Argument passed to handler                    |
|----------------------------------|--------------|-----------------------------------------------|
|SaxEventType.Text                 |0b000000000001| text: [Text](src/js/saxWasm.ts#L114)          |
|SaxEventType.ProcessingInstruction|0b000000000010| procInst: [Text](src/js/saxWasm.ts#L114)      |
|SaxEventType.SGMLDeclaration      |0b000000000100| sgmlDecl: [Text](src/js/saxWasm.ts#L114)      |
|SaxEventType.Doctype              |0b000000001000| doctype: [Text](src/js/saxWasm.ts#L114)       |
|SaxEventType.Comment              |0b000000010000| comment: [Text](src/js/saxWasm.ts#L114)       |
|SaxEventType.OpenTagStart         |0b000000100000| tag: [Tag](src/js/saxWasm.ts#L141)            |
|SaxEventType.Attribute            |0b000001000000| attribute: [Attribute](src/js/saxWasm.ts#L54) |
|SaxEventType.OpenTag              |0b000010000000| tag: [Tag](src/js/saxWasm.ts#L141)            |
|SaxEventType.CloseTag             |0b000100000000| tag: [Tag](src/js/saxWasm.ts#L141)            |
|SaxEventType.CDATA                |0b001000000000| start: [Position](src/js/saxWasm.ts#L39)      |

## Speeding things up on large documents
The speed of the sax-wasm parser is incredibly fast and can parse very large documents in a blink of an eye. Although
it's performance out of the box is ridiculous, the JavaScript thread *must* be involved with transforming raw
bytes to human readable data, there are times where slowdowns can occur if you're not careful. These are some of the
items to consider when top speed and performance is an absolute must:
1. Stream your document from it's source as a `Uint8Array` - This is covered in the examples above. Things slow down
significantly when the document is loaded in JavaScript as a string, then encoded to bytes using `Buffer.from(document)` or
`new TextEncoder.encode(document)` before being passed to the parser. Encoding on the JavaScript thread is adds a non-trivial
amount of overhead so its best to keep the data as raw bytes. Streaming often means the parser will already be done once
the document finishes downloading!
1. Keep the events bitmask to a bare minimum whenever possible - the more events that are required, the more work the
JavaScript thread must do once sax-wasm.wasm reports back.
1. Limit property reads on the reported data to only what's necessary - this includes things like stringifying the data to
json using `JSON.stringify()`. The first read of a property on a data object reported by the `eventHandler` will
retrieve the value from raw bytes and convert it to a `string`, `number` or `Position` on the JavaScript thread. This
conversion time becomes noticeable on very large documents with many elements and attributes. **NOTE:** After
the initial read, the value is cached and accessing it becomes faster.

## SAXParser.js
## Constructor
`SaxParser([events: number, [options: SaxParserOptions]])`

Constructs new SaxParser instance with the specified events bitmask and options
### Parameters

- `events` - A number representing a bitmask of events that should be reported by the parser.

### Methods

- `prepareWasm(wasm: Uint8Array): Promise<boolean>` - Instantiates the wasm binary with reasonable defaults and stores
the instance as a member of the class. Always resolves to true or throws if something went wrong.

- `write(chunk: Uint8Array, offset: number = 0): void;` - writes the supplied bytes to the wasm memory buffer and kicks
off processing. An optional offset can be provided if the read should occur at an index other than `0`. **NOTE:**
The `line` and `character` counters are *not* reset.

- `end(): void;` - Ends processing for the stream. The `line` and `character` counters are reset to zero and the parser is
readied for the next document.

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

This project requires rust v1.30+ since it contains the `wasm32-unknown-unknown` target out of the box.

Install rust:
```bash
curl https://sh.rustup.rs -sSf | sh
```
Install the stable compiler and switch to it.
```bash
rustup install stable
rustup default stable
```
Install the wasm32-unknown-unknown target.
```bash
rustup target add wasm32-unknown-unknown --toolchain stable
```
Install [node with npm](https://nodejs.org/en/) then run the following command from the project root.
```bash
npm install
```
Install the wasm-bindgen-cli tool
```bash
cargo install wasm-bindgen-cli
```
The project can now be built using:
```bash
npm run build
```
The artifacts from the build will be located in the `/libs` directory.
