import { SaxEventType, SAXParser, Text } from '../saxWasm';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { deepStrictEqual, strictEqual } from 'assert';

const saxWasm = readFileSync(resolve(__dirname, '../../../lib/sax-wasm.wasm'));
describe('When parsing XML, the SaxWasm', () => {
  let parser: SAXParser;
  let _event: SaxEventType;
  let _data: Text[];

  before(async () => {
    parser = new SAXParser(SaxEventType.Cdata);
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

  it('should report CDATA (upper case) correctly', () => {
    parser.write(Buffer.from('<div><![CDATA[ did you know "x < y" & "z > y"? so I guess that means that z > x ]]></div>'));
    const {start, end, value} = _data[0];
    deepStrictEqual(JSON.parse(JSON.stringify(start)), { line: 0, character: 7 });
    deepStrictEqual(JSON.parse(JSON.stringify(end)), { line: 0, character: 82 });
    strictEqual(value, ' did you know "x < y" & "z > y"? so I guess that means that z > x ');
  });

  it('should report cdata (lower case) correctly', () => {
    parser.write(Buffer.from('<div><![cdata[ did you know "x < y" & "z > y"? so I guess that means that z > x ]]></div>'));
    const {start, end, value} = _data[0];
    deepStrictEqual(JSON.parse(JSON.stringify(start)), { line: 0, character: 7 });
    deepStrictEqual(JSON.parse(JSON.stringify(end)), { line: 0, character: 82 });
    strictEqual(value, ' did you know "x < y" & "z > y"? so I guess that means that z > x ');
  });

  it('should report cDaTa (mixed case) correctly', () => {
    parser.write(Buffer.from('<div><![cDaTa[ did you know "x < y" & "z > y"? so I guess that means that z > x ]]></div>'));
    const {start, end, value} = _data[0];
    deepStrictEqual(JSON.parse(JSON.stringify(start)), { line: 0, character: 7 });
    deepStrictEqual(JSON.parse(JSON.stringify(end)), { line: 0, character: 82 });
    strictEqual(value, ' did you know "x < y" & "z > y"? so I guess that means that z > x ');
  });
});
