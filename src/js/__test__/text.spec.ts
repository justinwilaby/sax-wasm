import {SaxEventType, SAXParser, Text} from '../saxWasm';
import * as fs from 'fs';
import * as path from 'path';

const saxWasm = fs.readFileSync(path.resolve(__dirname, '../../../lib/sax-wasm.wasm'));

describe('SaxWasm', () => {
  let parser: SAXParser;
  let _event: SaxEventType;
  let _data: Text[];

  beforeEach(async () => {
    parser = new SAXParser();
    parser.events = SaxEventType.Text;

    _data = [];
    _event = 0;

    parser.eventHandler = function (event: SaxEventType, data: Text) {
      _event = event;
      _data.push(data);
    };
    return parser.prepareWasm(saxWasm);
  });

  afterEach(() => {
    parser.end();
  });

  it('should report text that occurs outside of an element', () => {
    parser.write('this is just plain text <br>');
    expect(_data[0].value).toBe('this is just plain text ');
  });

  it('should report multiple text blocks when child nodes exist between them', () => {
    parser.write('<div>I like to use <bold>bold text</bold> to emphasize</div>');

    expect(_data.length).toBe(3);
    expect(_data[0].value).toBe('I like to use ');
    expect(_data[1].value).toBe('bold text');
    expect(_data[2].value).toBe(' to emphasize');
  });

  it('should capture conrtol chars properly', () => {
    const str = `<div>


</div>`;
  parser.write(str);

  expect(_data[0].value).toBe('\n\n\n');
  });
});
