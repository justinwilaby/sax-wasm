# SAX (Simple API for XML) for Web Assembly
*When you absolutely, positively have to have the fastest parser in the room, accept no substitutes.*

The first streamable, fixed memory XML, HTML, and JSX parser for [WebAssembly](https://developer.mozilla.org/en-US/docs/WebAssembly).
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
  }
})

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
    parser.write('<div class="modal"></div>')
});

```

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
