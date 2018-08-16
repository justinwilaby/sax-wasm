# SAX (Simple API for XML) for Web Assembly

[![Build Status](https://travis-ci.org/justinwilaby/sax-wasm.svg?branch=master)](https://travis-ci.org/justinwilaby/sax-wasm)
[![Coverage Status](https://coveralls.io/repos/github/justinwilaby/sax-wasm/badge.svg?branch=master)](https://coveralls.io/github/justinwilaby/sax-wasm?branch=master)

*When you absolutely, positively have to have the fastest parser in the room, accept no substitutes.*

The first streamable, low memory XML, HTML, and JSX parser for [WebAssembly](https://developer.mozilla.org/en-US/docs/WebAssembly).
**And yes, it will parse JSX!**

Sax Wasm is a sax style parser for XML, HTML and JSX written in [Rust](https://www.rust-lang.org/en-US/), compiled for Web Assembly with the sole motivation
to bring **near native speeds** to xml and JSX parsing for node and the web.

This is a port of [sax js](https://github.com/isaacs/sax-js) to Rust for Web Assembly with optimizations for speed and JSX specific syntax.
Since there are no built-ins with WebAssembly, file size is larger but execution time is faster, sometimes much, much faster.

## Installation
```bash
npm i -s sax-wasm
```
## Usage in Node
```js
const fs = require('fs');
const { SaxEventType, SAXParser } = require('sax-wasm');

// Get the path to the Web Assembly binary and load it
const saxPath = require.resolve('sax-wasm/lib/sax-wasm.wasm');
const saxWasmBuffer = fs.readFileSync(saxPath);

// Instantiate 
const parser = new SAXParser(0, SaxEventType.Attribute | SaxEventType.OpenTag);
parser.eventHandler = (event, data) => {
  if (event === SaxEventType.Attribute ) {
    // process attribute
  } else {
    // process open tag
  }
}

// Instantiate and prepare the wasm for parsing
parser.prepareWasm(saxWasmBuffer).then(ready => {
  if (ready) {
    parser.write('<div class="modal"></div>');
    parser.end();
  }
});

```
## Usage for the web

```js
import { SaxEventType, SAXParser } from 'sax-wasm';

async function loadAndPrepareWasm() {
  const saxWasmResponse = await fetch('./path/to/wasm/sax-wasm.wasm');
  const saxWasmbuffer = await saxWasmResponse.arrayBuffer();
  const parser = new SAXParser(0, SaxEventType.Attribute | SaxEventType.OpenTag);
  
  // Instantiate and prepare the wasm for parsing
  const ready = await parser.prepareWasm(new Uint8Array(saxWasmbuffer));
  if (ready) {
    return parser;
  }
}

loadAndPrepareWasm().then(parser => {
  parser.eventHandler = (event, data) => {
      if (event === SaxEventType.Attribute ) {
          // process attribute
        } else {
          // process open tag
        }
    }
    parser.write('<div class="modal"></div>');
    parser.end();
});
```

## Differences from sax-js
Besides being incredibly fast, there are some notable differences between sax-wasm and sax-js that may affect some users
when migrating:

1. JSX is supported including JSX fragments. Things like `<foo bar={this.bar()}></bar>` will parse as expected.
1. No attempt is made to validate the document. sax-wasm reports what it sees. If you need "strict mode", it could 
be recreated by applying rules to the events that are reported by the parser.
1. Namespaces are reported in attributes. No special events dedicated to namespaces
1. The parser is ready as soon as the promise is handled.

## Streaming 
Streaming is supported with sax-wasm by writing utf-8 encoded text to the parser instance. Writes can occur safely 
anywhere except withing the `eventHandler` function or within the `eventTrap` (when extending `SAXParser` class). 
Doing so anyway risks overwriting memory still in play.

## Events
Events are subscribed to using a bitmask composed from flags representing the event type. 
Bit positions along a 15 bit integer can be masked on to tell the parser to emit the event of that type.
For example, passing in the following bitmask to the parser instructs it to emit events for text, open tags and attributes:
```js
import { SaxEventType } from 'sax-wasm';
parser.events = SaxEventType.Text | SaxEventType.OpenTag | SaxEventType.Attribute;
```
Complete list of event/argument pairs:

|Event                             |Argument            |
|----------------------------------|--------------------|
|SaxEventType.Text                 |text: string        |
|SaxEventType.ProcessingInstruction|procInst: string    |
|SaxEventType.SGMLDeclaration      |sgmlDecl: string    |
|SaxEventType.Doctype              |doctype: string     |
|SaxEventType.Comment              |comment: string     |
|SaxEventType.OpenTagStart         |tag: Tag            |
|SaxEventType.Attribute            |attribute: Attribute|
|SaxEventType.OpenTag              |tag: Tag            |
|SaxEventType.CloseTag             |tag: Tag            |
|SaxEventType.OpenCDATA            |start: Position     |
|SaxEventType.CDATA                |cdata: string       |
|SaxEventType.CloseCDATA           |end: Position       |
|SaxEventType.CloseNamespace       |ns: Namespace       |
|SaxEventType.Script               |script: string      |
|SaxEventType.OpenNamespace        |ns: Namespace       |

## SAXParser.js
### Methods
- `prepareWasm(wasm: Uint8Array): Promise<boolean>` - Instantiates the wasm binary with reasonable defaults and stores the instance as a member of the class. Always resolves to
true or throws if something went wrong.

- `write(buffer: string): void;` - writes the supplied string to the wasm stream and kicks off processing. 
The character and line counters are *not* reset.

- `end(): void;` - Ends processing for the stream. The character and line counters are reset to zero and the parser is 
readied for the next document.
### Properties

- `events` - A bitmask containing the events to subscribe to. See the examples for creating the bitmask

- `eventHanlder` - A function reference used for event handling. The supplied function must have a signature that accepts 
2 arguments: 1. The `event` which is one of the `SaxEventTypes` and the `body` (listed in the table above)

## sax-wasm.wasm
### Methods
- `parser(events: u32)` - Prepares the parser struct internally and supplies it with the specified events bitmask. Changing
the events bitmask can be done at anytime during processing using this method.

- `write(ptr: *mut u8, length: usize)` - Supplies the parser with the location and length of the newly written bytes in the 
stream and kicks off processing. The parser assumes that the bytes are valid utf-8. Writing non utf-8 bytes will may cause
unpredictable behavior.

- `end()` - resets the character and line counts but does not halt processing of the current buffer. 

## Building from source
### Prerequisites
This project requires rust v1.29+ since it contains the `wasm32-unknown-unknown` target out of the box. This is 
currently only available in the nightly build.

Install rust:
```bash
curl https://sh.rustup.rs -sSf | sh
```
Install the nightly compiler and switch to it.
```bash
rustup install nightly
rustup default nightly
```
Install the wasm32-unknown-unknown target.
```bash
rustup target add wasm32-unknown-unknown --toolchain nightly
```
Install [node with npm](https://nodejs.org/en/) then run the following command from the project root.
```bash
npm install
```
The project can now be built using: 
```bash
npm run build
```
The artifacts from the build will be located in the `/libs` directory.
