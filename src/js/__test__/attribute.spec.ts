import {Attribute, SaxEventType, SAXParser} from '../';
import * as fs from 'fs';
import * as path from 'path';

const saxWasm = fs.readFileSync(path.resolve(__dirname, '../../../lib/sax-wasm.wasm'));

describe('SaxWasm', () => {
  let parser: SAXParser;
  let _event: number;
  let _data: Attribute[];
  beforeEach(async () => {
    parser = new SAXParser(SaxEventType.Attribute);
    _data = [] as Attribute[];
    _event = 0;

    parser.eventHandler = function (event:SaxEventType, data:Attribute) {
      _event |= event as number;
      _data.push(data);
    };
    return parser.prepareWasm(saxWasm);
  });

  it('should recognize attribute names', () => {
    parser.write('<body class="main"></body>');
    expect(_event).toBe(SaxEventType.Attribute);
    expect(_data.length).toBe(1);
    expect(_data[0].name).toBe('class');
    expect(_data[0].value).toBe('main');
  });

  it('should recognize attribute names when no spaces separate them', () => {
    parser.write('<component data-id="user_1234"key="23"/>');
    expect(_event).toBe(SaxEventType.Attribute);
    expect(_data[0].name).toBe('data-id');
    expect(_data[0].value).toBe('user_1234');
    expect(_data[1].name).toBe('key');
    expect(_data[1].value).toBe('23');
  });

  it('should preserve grapheme clusters as attribute values', () => {
    parser.write('<div id="👅"></div>div>');
    expect(_event).toBe(SaxEventType.Attribute);
    expect(_data[0].name).toBe('id');
    expect(_data[0].value).toBe('👅');
  });

  it('should provide the attribute value when the value is not qupted', () => {
    parser.write('<body app=buggyAngularApp></body>');
    expect(_event).toBe(SaxEventType.Attribute);
    expect(_data[0].name).toBe('app');
    expect(_data[0].value).toBe('buggyAngularApp');
  });
});
