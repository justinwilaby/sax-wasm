import {ProcInst, SaxEventType, SAXParser} from '../saxWasm';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { deepStrictEqual, strictEqual } from 'assert';

const saxWasm = readFileSync(resolve(__dirname, '../../../lib/sax-wasm.wasm'));

describe('When parsing JSX, the SaxWasm', () => {
  let parser: SAXParser;
  let _event: SaxEventType;
  let _data: ProcInst;

  before(async () => {
    parser = new SAXParser(SaxEventType.ProcessingInstruction);

    parser.eventHandler = function (event, data) {
      _event = event;
      _data = data as ProcInst;
    };
    return parser.prepareWasm(saxWasm);
  });

  beforeEach(() => {
    _data = null;
  });

  afterEach(() => {
    parser.end();
  });

  it('should recognize Processing Instructions', () => {
    parser.write(Buffer.from('<?xml version="1.0" encoding="utf-8"?>'));
    strictEqual(_event, SaxEventType.ProcessingInstruction);
    strictEqual('' + _data, '<? xml version="1.0" encoding="utf-8" ?>')
    strictEqual('' + _data.content, 'version="1.0" encoding="utf-8"');
    const result: Record<keyof ProcInst, Text > = JSON.parse(JSON.stringify(_data));
    deepStrictEqual(result.content, {
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

    deepStrictEqual(result.target, {
      end: {
        character: 5,
        line: 0
      },
      start: {
        character: 3,
        line: 0
      },
      value: 'xml'
    });
  });
});
