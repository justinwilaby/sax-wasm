import { afterEach, before, beforeEach, describe, it } from 'node:test';
import { ProcInst, Reader, SaxEventType, SAXParser } from '../saxWasm.ts';
import type { Detail } from '../saxWasm.ts';
import { readFileSync } from 'fs';
import { deepEqual, strictEqual } from 'node:assert';

const saxWasm = readFileSync(new URL('../../../lib/sax-wasm.wasm', import.meta.url));

describe('When parsing processing instructions, the SaxWasm', () => {
  let parser: SAXParser;
  let _event: SaxEventType;
  let _data: ProcInst | undefined;

  before(async () => {
    parser = new SAXParser(SaxEventType.ProcessingInstruction);

    parser.eventHandler = function (event: SaxEventType, data:Reader<Detail>) {
      _event = event;
      _data = data.toJSON() as ProcInst;
    };
    return parser.prepareWasm(saxWasm);
  });

  beforeEach(() => {
    _data = undefined;
  });

  afterEach(() => {
    parser.end();
  });

  it('should recognize Processing Instructions', () => {
    parser.write(Buffer.from('<?xml version="1.0" encoding="utf-8"?>'));
    strictEqual(_event, SaxEventType.ProcessingInstruction);
    strictEqual(_data?.target.value, 'xml')
    strictEqual(_data.content.value, 'version="1.0" encoding="utf-8"');
    deepEqual(_data.content.start, { character: 6, line: 0 })
    deepEqual(_data.content.end, { character: 36, line: 0 });

    deepEqual(_data.target.start, { character: 2, line: 0 })
    deepEqual(_data.target.end, { character: 5, line: 0 });

  });

  for (const chunkSize of [1, 7, 65536]) it(`reports UTF-8 byte offsets across ${chunkSize}-byte writes`, () => {
    const input = Buffer.from('<root>é🚀\n<?target content?></root>');
    for (let offset = 0; offset < input.length; offset += chunkSize) {
      parser.write(input.subarray(offset, offset + chunkSize));
    }
    deepEqual(_data?.byteOffsets, {
      start: input.indexOf('<?'),
      end: input.indexOf('?>') + 2,
    });
  });

  it('should parse the unexpected question mark instead of tag name as a processing instruction', () => {
    const doc = `<!--lit-part cI7PGs8mxHY=-->
      <p><!--lit-part-->hello<!--/lit-part--></p>
      <!--lit-part BRUAAAUVAAA=--><?><!--/lit-part-->
      <!--lit-part--><!--/lit-part-->
      <p>more</p>
    <!--/lit-part-->`;
    parser.write(Buffer.from(doc));
    strictEqual(_event, SaxEventType.ProcessingInstruction);

    deepEqual(_data?.start, {line: 2, character: 34});
    deepEqual(_data?.end, {line: 2, character: 37});
  })
});
