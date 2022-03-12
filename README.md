# SAX (Simple API for XML) for WebAssembly

[![Build Status](https://travis-ci.org/justinwilaby/sax-wasm.svg?branch=master)](https://travis-ci.org/justinwilaby/sax-wasm)
[![Coverage Status](https://coveralls.io/repos/github/justinwilaby/sax-wasm/badge.svg?branch=master)](https://coveralls.io/github/justinwilaby/sax-wasm?branch=master)

*When you absolutely, positively have to have the fastest parser in the room, accept no substitutes.*

The first streamable, low memory XML, HTML, JSX and Angular Template parser for [WebAssembly](https://developer.mozilla.org/en-US/docs/WebAssembly).

Sax Wasm is a sax style parser for XML, HTML, JSX and Angular Templates written in [Rust](https://www.rust-lang.org/en-US/), compiled for
WebAssembly with the sole motivation to bring **faster than native speeds** to XML and JSX parsing for node and the web.
Inspired by [sax js](https://github.com/isaacs/sax-js) and rebuilt with Rust for WebAssembly, sax-wasm brings optimizations
for speed and support for JSX syntax.

Suitable for [LSP](https://langserver.org/) implementations, sax-wasm provides line numbers and character positions within the
document for elements, attributes and text node which provides the raw building blocks for linting, transpilation and lexing.

## Benchmarks (Node v16.14.0 / 2.7 GHz Quad-Core Intel Core i7)
All parsers are tested using a large XML document (2.1 MB) containing a variety of elements and is streamed when supported
by the parser. This attempts to recreate the best real-world use case for parsing XML. Other libraries test benchmarks using a
very small XML fragment such as `<foo bar="baz">quux</foo>` which does not hit all code branches responsible for processing the
document and heavily skews the results in their favor.

| Parser with Advanced Features                                                              | time/ms (lower is better) | JS     | Runs in browser |
|--------------------------------------------------------------------------------------------|--------------------------:|:------:|:---------------:|
| [sax-wasm](https://github.com/justinwilaby/sax-wasm)                                       |                     64.16 | ☑      | ☑               |
| [sax-js](https://github.com/isaacs/sax-js)                                                 |                    155.77 | ☑      | ☑*              |
| [node-expat](https://github.com/node-xmpp/node-expat)                                      |                    234.78 | ☐      | ☐               |
| [libxmljs](https://github.com/polotek/libxmljs)                                            |                    274.95 | ☐      | ☐               |
| [node-xml](https://github.com/dylang/node-xml)                                             |                    685.00 | ☑      | ☐               |
<sub>*built for node but *should* run in the browser</sub>

## Installation
```bash
npm i -s sax-wasm
```
## Usage in Node
```js
const fs = require('fs');
const path = require('path');
const { SaxEventType, SAXParser } = require('sax-wasm');

// Get the path to the WebAssembly binary and load it
const saxPath = require.resolve('sax-wasm/lib/sax-wasm.wasm');
const saxWasmBuffer = fs.readFileSync(saxPath);

// Instantiate
const options = {highWaterMark: 32 * 1024}; // 32k chunks
const parser = new SAXParser(SaxEventType.Attribute | SaxEventType.OpenTag, options);
parser.eventHandler = (event, data) => {
  if (event === SaxEventType.Attribute) {
    // process attribute
  } else {
    // process open tag
  }
};

// Instantiate and prepare the wasm for parsing
parser.prepareWasm(saxWasmBuffer).then(ready => {
  if (ready) {
    // stream from a file in the current directory
    const readable = fs.createReadStream(path.resolve(path.resolve('.', 'path/to/document.xml')), options);
    readable.on('data', (chunk) => {
      parser.write(chunk);
    });
    readable.on('end', () => parser.end());
  }
});
```
## Usage for the web

```js
import { SaxEventType, SAXParser } from 'sax-wasm';

async function loadAndPrepareWasm() {
  const saxWasmResponse = await fetch('./path/to/wasm/sax-wasm.wasm');
  const saxWasmbuffer = await saxWasmResponse.arrayBuffer();
  const parser = new SAXParser(SaxEventType.Attribute | SaxEventType.OpenTag, {highWaterMark: 64 * 1024}); // 64k chunks

  // Instantiate and prepare the wasm for parsing
  const ready = await parser.prepareWasm(new Uint8Array(saxWasmbuffer));
  if (ready) {
    return parser;
  }
}

loadAndPrepareWasm().then(processDocument);

function processDocument(parser) {
  parser.eventHandler = (event, data) => {
    if (event === SaxEventType.Attribute ) {
        // process attribute
      } else {
        // process open tag
      }
  }

  fetch('path/to/document.xml').then(async response => {
    if (!response.ok) {
      // fail in some meaningful way
    }
    // Get the reader to stream the document to sax-wasm
    const reader = response.body.getReader();
    while(true) {
      const chunk = await reader.read();
      if (chunk.done) {
        return parser.end();
      }
      parser.write(chunk);
    }
  });
}
```

## Differences from sax-js
Besides being incredibly fast, there are some notable differences between sax-wasm and sax-js that may affect some users
when migrating:

1. JSX is supported including JSX fragments. Things like `<foo bar={this.bar()}></bar>` and `<><foo/><bar/></>` will parse as expected.
1. Angular 2+ templates are supported. Things like <button type="submit" [disabled]=disabled *ngIf=boolean (click)="clickHandler(event)"></button> will parse as expected.
1. No attempt is made to validate the document. sax-wasm reports what it sees. If you need strict mode or document validation, it may
be recreated by applying rules to the events that are reported by the parser.
1. Namespaces are reported in attributes. No special events dedicated to namespaces.
1. Streaming utf-8 code points in a Uint8Array is required.

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

|Event                             |Mask          |Argument passed to handler                      |
|----------------------------------|--------------|------------------------------------------------|
|SaxEventType.Text                 |0b000000000001|text: [Text](src/js/saxWasm.ts#L106)            |
|SaxEventType.ProcessingInstruction|0b000000000010|procInst: [Text](src/js/saxWasm.ts#L106)        |
|SaxEventType.SGMLDeclaration      |0b000000000100|sgmlDecl: [Text](src/js/saxWasm.ts#L106)        |
|SaxEventType.Doctype              |0b000000001000|doctype: [Text](src/js/saxWasm.ts#L106)         |
|SaxEventType.Comment              |0b000000010000|comment: [Text](src/js/saxWasm.ts#L106)         |
|SaxEventType.OpenTagStart         |0b000000100000|tag: [Tag](src/js/saxWasm.ts#L133)              |
|SaxEventType.Attribute            |0b000001000000|attribute: [Attribute](src/js/saxWasm.ts#L49)   |
|SaxEventType.OpenTag              |0b000010000000|tag: [Tag](src/js/saxWasm.ts#L133)              |
|SaxEventType.CloseTag             |0b000100000000|tag: [Tag](src/js/saxWasm.ts#L133)              |
|SaxEventType.CDATA                |0b001000000000|start: [Position](src/js/saxWasm.ts#L39)        |

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
- `options` - When specified, the `highWaterMark` option is used to prepare the parser for the expected size of each chunk
provided by the stream. The parser will throw if chunks written to it are larger.

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
