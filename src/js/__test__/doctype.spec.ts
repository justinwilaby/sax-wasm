import { afterEach, before, beforeEach, describe, it } from 'node:test';
import { Reader, SaxEventType, SAXParser, Text } from '../saxWasm.ts';
import type { Detail } from '../saxWasm.ts';
import { readFileSync } from 'fs';
import { deepEqual, strictEqual } from 'node:assert';

const saxWasm = readFileSync(new URL('../../../lib/sax-wasm.wasm', import.meta.url));
describe('When parsing XML, the SaxWasm', () => {
  let parser: SAXParser;
  let _event: SaxEventType | undefined;
  let _data: Text[];

  before(async () => {
    parser = new SAXParser(SaxEventType.Doctype);
    _data = [];

    parser.eventHandler = function (event: SaxEventType, data:Reader<Detail>) {
      _event = event;
      _data.push(data.toJSON() as Text);
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
    deepEqual(start, { line: 0, character: 0 });
    deepEqual(end, { line: 0, character: 15 });
    strictEqual(value, 'html');
    strictEqual(_event, SaxEventType.Doctype);
  });

  it('should report doctype (lower case) correctly', () => {
    parser.write(Buffer.from('<!doctype html>\n<body><div>Hello HTML!</div></body>'));
    const {start, end, value} = _data[0];
    deepEqual(start, { line: 0, character: 0 });
    deepEqual(end, { line: 0, character: 15 });
    strictEqual(value, 'html');
    strictEqual(_event, SaxEventType.Doctype);
  });

  it('should report DocType (mixed case) correctly', () => {
    parser.write(Buffer.from('<!DocType html>\n<body><div>Hello HTML!</div></body>'));
    const {start, end, value} = _data[0];
    deepEqual(start, { line: 0, character: 0 });
    deepEqual(end, { line: 0, character: 15 });
    strictEqual(value, 'html');
    strictEqual(_event, SaxEventType.Doctype);
  });
});
