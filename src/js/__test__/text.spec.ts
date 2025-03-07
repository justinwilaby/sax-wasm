import { readFileSync } from 'fs';
import { resolve } from 'path';
import { deepStrictEqual, strictEqual } from  'assert';
import { Detail, Reader, SaxEventType, SAXParser } from '../saxWasm';

const saxWasm = readFileSync(resolve(__dirname, '../../../lib/sax-wasm.wasm'));
describe('SaxWasm', () => {
  let parser;
  let _event;
  let _data;

  beforeEach(async () => {
    parser = new SAXParser();
    parser.events = SaxEventType.Text;

    _data = [];
    _event = 0;

    parser.eventHandler = function (event: SaxEventType, data:Reader<Detail>) {
      _event = event;
      _data.push(data.toJSON());
    };
    return parser.prepareWasm(saxWasm);
  });

  it('should report text that occurs outside of an element', () => {
    parser.write(Buffer.from('this is just plain text <br>'));
    parser.end();
    deepStrictEqual(_data[0].value,'this is just plain text ');
    strictEqual(_event, SaxEventType.Text);
  });

  it('should report multiple text blocks when child nodes exist between them', () => {
    parser.write(Buffer.from('<div>I like to use <bold>bold text</bold> to emphasize</div>'));
    parser.end();
    deepStrictEqual(_data.length,3);
    deepStrictEqual(_data[0].value,'I like to use ');
    deepStrictEqual(_data[1].value,'bold text');
    deepStrictEqual(_data[2].value,' to emphasize');
    strictEqual(_event, SaxEventType.Text);
  });

  it('should not capture empty white space between tags', () => {
    const str = `<div>


</div>`;
  parser.write(Buffer.from(str));
  parser.end();

  deepStrictEqual(_data.length, 0);
  });

  it('should serialize to JSON as deepStrictEqualed', () => {
    parser.write(Buffer.from('a happy little parser'));
    parser.end();
    deepStrictEqual(JSON.stringify(_data[0]),'{"start":{"line":0,"character":0},"end":{"line":0,"character":21},"value":"a happy little parser"}');
    strictEqual(_event, SaxEventType.Text);
  });
});
