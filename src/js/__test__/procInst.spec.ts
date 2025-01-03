import { ProcInst, SaxEventType, SAXParser } from '../saxWasm';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { deepStrictEqual, strictEqual } from 'assert';

const saxWasm = readFileSync(resolve(__dirname, '../../../lib/sax-wasm.wasm'));

describe('When parsing JSX, the SaxWasm', () => {
  let parser: SAXParser;
  let _event: SaxEventType;
  let _data: ProcInst | undefined;

  beforeAll(async () => {
    parser = new SAXParser(SaxEventType.ProcessingInstruction);

    parser.eventHandler = function (event, data) {
      _event = event;
      _data = JSON.parse(JSON.stringify(data)) as ProcInst;
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
    deepStrictEqual(_data.content, {
      end: {
        character: 36,
        line: 0
      },
      start: {
        character: 6,
        line: 0
      },
      value: 'version="1.0" encoding="utf-8"'
    });

    deepStrictEqual(_data.target, {
      end: {
        character: 5,
        line: 0
      },
      start: {
        character: 2,
        line: 0
      },
      value: 'xml'
    });
  });

  it('should parse the "unexpected question mark instead of tag name" as a processing instruction', () => {
    const doc = `<!--lit-part cI7PGs8mxHY=-->
      <p><!--lit-part-->hello<!--/lit-part--></p>
      <!--lit-part BRUAAAUVAAA=--><?><!--/lit-part-->
      <!--lit-part--><!--/lit-part-->
      <p>more</p>
    <!--/lit-part-->`;
    parser.write(Buffer.from(doc));
    strictEqual(_event, SaxEventType.ProcessingInstruction);

    deepStrictEqual(_data?.start, {line: 2, character: 35});
    deepStrictEqual(_data.end, {line: 2, character: 37});
  })
});
