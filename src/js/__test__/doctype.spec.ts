import { SaxEventType, SAXParser, Text } from '../saxWasm';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { deepStrictEqual, strictEqual } from 'assert';

const saxWasm = readFileSync(resolve(__dirname, '../../../lib/sax-wasm.wasm'));
describe('When parsing XML, the SaxWasm', () => {
  let parser: SAXParser;
  let _event: SaxEventType;
  let _data: Text[];

  beforeAll(async () => {
    parser = new SAXParser(SaxEventType.Doctype);
    _data = [];
    _event = 0;

    parser.eventHandler = function (event, data) {
      _event = event;
      _data.push(data as Text);
    };
    return parser.prepareWasm(saxWasm);
  });

  beforeEach(() => {
    _data = [];
  });

  afterEach(() => {
    parser.end();
  });

  it('should report DOCTYPE (upper case) correctly', () => {
    parser.write(Buffer.from('<!DOCTYPE html>\n<body><div>Hello HTML!</div></body>'));
    const {start, end, value} = _data[0];
    deepStrictEqual(JSON.parse(JSON.stringify(start)), { line: 0, character: 2 });
    deepStrictEqual(JSON.parse(JSON.stringify(end)), { line: 0, character: 14 });
    strictEqual(value, 'html');
  });

  it('should report doctype (lower case) correctly', () => {
    parser.write(Buffer.from('<!doctype html>\n<body><div>Hello HTML!</div></body>'));
    const {start, end, value} = _data[0];
    deepStrictEqual(JSON.parse(JSON.stringify(start)), { line: 0, character: 2 });
    deepStrictEqual(JSON.parse(JSON.stringify(end)), { line: 0, character: 14 });
    strictEqual(value, 'html');
  });

  it('should report DocType (mixed case) correctly', () => {
    parser.write(Buffer.from('<!DocType html>\n<body><div>Hello HTML!</div></body>'));
    const {start, end, value} = _data[0];
    deepStrictEqual(JSON.parse(JSON.stringify(start)), { line: 0, character: 2 });
    deepStrictEqual(JSON.parse(JSON.stringify(end)), { line: 0, character: 14 });
    strictEqual(value, 'html');
  });
});
