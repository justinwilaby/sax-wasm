import { Detail, SaxEventType, SAXParser } from '../saxWasm';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { deepStrictEqual } from 'assert';

const saxWasm = readFileSync(resolve(__dirname, '../../../lib/sax-wasm.wasm'));

describe('When parsing JSX, the SaxWasm', () => {
  let parser: SAXParser;
  let _event: SaxEventType;
  let _data: Detail;

  before(async () => {
    parser = new SAXParser(SaxEventType.ProcessingInstruction);

    parser.eventHandler = function (event, data) {
      _event = event;
      _data = data;
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
    deepStrictEqual(_event, SaxEventType.ProcessingInstruction);
    deepStrictEqual('' + _data, 'version="1.0" encoding="utf-8"');
  });
});
