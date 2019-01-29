import {Attribute, SaxEventType, SAXParser} from '../saxWasm';
import * as fs from 'fs';
import * as path from 'path';

const saxWasm = fs.readFileSync(path.resolve(__dirname, '../../../lib/sax-wasm.wasm'));

describe('SaxWasm', () => {
  let parser: SAXParser;
  let _event: SaxEventType;
  let _data: Attribute[];

  beforeAll(async () => {
    parser = new SAXParser(SaxEventType.Attribute);

    parser.eventHandler = function (event: SaxEventType, data: Attribute) {
      _event = event;
      _data.push(data);
    };
    return parser.prepareWasm(saxWasm);
  });

  beforeEach(() => {
    _data = [] as Attribute[];
  });

  afterEach(() => {
    parser.end();
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
    parser.write('<div id="👅"></div>');
    expect(_event).toBe(SaxEventType.Attribute);
    expect(_data[0].name).toBe('id');
    expect(_data[0].value).toBe('👅');
  });

  it('should provide the attribute value when the value is not quoted', () => {
    parser.write('<body app=buggyAngularApp></body>');
    expect(_event).toBe(SaxEventType.Attribute);
    expect(_data[0].name).toBe('app');
    expect(_data[0].value).toBe('buggyAngularApp');
  });

  it('should provide the attribute value when the value is a JSX expression', () => {
    parser.write('<Component props={() => { return this.props } }></Component>');
    expect(_event).toBe(SaxEventType.Attribute);
    expect(_data[0].name).toBe('props');
    expect(_data[0].value).toBe('() => { return this.props } ');
  });

  it('should report the correct start and end positions for attributes', () => {
    const html = `
<div 
  data-value="👅"
  class="grapheme cluster">
</div>`;

    parser.write(html);
    expect(_event).toBe(SaxEventType.Attribute);
    expect(_data[0].nameStart).toEqual({line: 2, character: 2});
    expect(_data[0].nameEnd).toEqual({line: 2, character: 12});
    expect(_data[0].valueStart).toEqual({line: 2, character: 14});
    expect(_data[0].valueEnd).toEqual({line: 2, character: 15});

    expect(_data[1].nameStart).toEqual({line: 3, character: 2});
    expect(_data[1].nameEnd).toEqual({line: 3, character: 7});
    expect(_data[1].valueStart).toEqual({line: 3, character: 9});
    expect(_data[1].valueEnd).toEqual({line: 3, character: 25});
  });

  it('should report namespaces as attributes', () => {
    parser.write(`<x xmlns:edi='http://ecommerce.example.org/schema'></x>`);
    expect(_event).toBe(SaxEventType.Attribute);
    expect(_data[0].name).toBe('xmlns:edi');
    expect(_data[0].value).toBe('http://ecommerce.example.org/schema');
  });

});
