import { Detail, SaxEventType, SAXParser, StringReader } from '../saxWasm';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {strictEqual, deepStrictEqual} from 'assert';

const saxWasm = readFileSync(resolve(__dirname, '../../../lib/sax-wasm.wasm'));
describe('When parsing XML, the SaxWasm', () => {
  let parser: SAXParser;
  let _event: SaxEventType;
  let _data: Detail[];

  before(async () => {
    parser = new SAXParser(SaxEventType.Cdata | SaxEventType.OpenCDATA);
    _data = [];
    _event = 0;

    parser.eventHandler = function (event, data) {
      _event = event;
      _data.push(data as StringReader);
    };
    return parser.prepareWasm(saxWasm);
  });

  beforeEach(() => {
    _data = [];
  });

  afterEach(() => {
    parser.end();
  });

  it('should report CDATA correctly', () => {
    parser.write(Buffer.from('<div><![CDATA[ did you know "x < y" & "z > y"? so I guess that means that z > x ]]></div>'));
    deepStrictEqual(JSON.parse(JSON.stringify(_data[0])), { line: 0, character: 7 });
    strictEqual('' + _data[1],' did you know "x < y" & "z > y"? so I guess that means that z > x ');
  });
});
