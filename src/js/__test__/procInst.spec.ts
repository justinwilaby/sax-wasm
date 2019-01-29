import {SaxEventType, SAXParser} from '../saxWasm';
import * as fs from 'fs';
import * as path from 'path';

const saxWasm = fs.readFileSync(path.resolve(__dirname, '../../../lib/sax-wasm.wasm'));
describe('When parsing JSX, the SaxWasm', () => {
  let parser: SAXParser;
  let _event: number;
  let _data: string;

  beforeAll(async () => {
    parser = new SAXParser(SaxEventType.ProcessingInstruction);

    parser.eventHandler = function (event: SaxEventType, data: string) {
      _event = event as number;
      _data = data;
    };
    return parser.prepareWasm(saxWasm);
  });

  beforeEach(() => {
    _data = '';
  });

  afterEach(() => {
    parser.end();
  });

  it('should recognize Processing Instructions', () => {
    parser.write('<?xml version="1.0" encoding="utf-8"?>');
    expect(_event).toBe(SaxEventType.ProcessingInstruction);
    expect(_data).toBe('version="1.0" encoding="utf-8"');
  });
});
