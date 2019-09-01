import { Attribute, Detail, SaxEventType, SAXParser } from '../saxWasm'
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {deepStrictEqual, } from 'assert';

const saxWasm = readFileSync(resolve(__dirname, '../../../lib/sax-wasm.wasm'));

describe('SaxWasm', () => {
  let parser: SAXParser;
  let _event: SaxEventType;
  let _data: Attribute[];

  before(async () => {
    parser = new SAXParser(SaxEventType.Attribute);

    parser.eventHandler = function (event:SaxEventType, data:Attribute) {
      _event = event;
      _data.push(data as Attribute);
    };
    return parser.prepareWasm(saxWasm);
  });

  beforeEach(() => {
    _data = [];
  });

  afterEach(() => {
    parser.end();
  });

  it('should recognize attribute names', () => {
    parser.write(Buffer.from('<body class="main"></body>'));
    deepStrictEqual(_event, SaxEventType.Attribute);
    deepStrictEqual(_data.length,1);
    deepStrictEqual(_data[0].name,'class');
    deepStrictEqual(_data[0].value,'main');
  });

  it('should recognize attribute names when no spaces separate them', () => {
    parser.write(Buffer.from('<component data-id="user_1234"key="23"/>'));
    deepStrictEqual(_event,SaxEventType.Attribute);
    deepStrictEqual(_data[0].name,'data-id');
    deepStrictEqual(_data[0].value,'user_1234');
    deepStrictEqual(_data[1].name,'key');
    deepStrictEqual(_data[1].value,'23');
  });

  it('should preserve grapheme clusters as attribute values', () => {
    parser.write(Buffer.from('<div id="👅"></div>'));
    deepStrictEqual(_event,SaxEventType.Attribute);
    deepStrictEqual(_data[0].name,'id');
    deepStrictEqual(_data[0].value,'👅');
  });

  it('should provide the attribute value when the value is not quoted', () => {
    parser.write(Buffer.from('<body app="buggyAngularApp=19"></body>'));
    deepStrictEqual(_event,SaxEventType.Attribute);
    deepStrictEqual(_data[0].name,'app');
    deepStrictEqual(_data[0].value,'buggyAngularApp=19');
  });

  it('should provide the attribute value when the value is a JSX expression', () => {
    parser.write(Buffer.from('<Component props={() => { return this.props } }></Component>'));
    deepStrictEqual(_event,SaxEventType.Attribute);
    deepStrictEqual(_data[0].name,'props');
    deepStrictEqual(_data[0].value,'() => { return this.props } ');
  });

  it('should report the correct start and end positions for attributes', () => {
    const html = `
<div 
  data-value="👅"
  class="grapheme cluster">
</div>`;

    parser.write(Buffer.from(html));
    deepStrictEqual(_event,SaxEventType.Attribute);
    deepStrictEqual(JSON.parse(JSON.stringify(_data[0].nameStart)),{ line: 2, character: 2 });
    deepStrictEqual(JSON.parse(JSON.stringify(_data[0].nameEnd)),{ line: 2, character: 12 });
    deepStrictEqual(JSON.parse(JSON.stringify(_data[0].valueStart)),{ line: 2, character: 14 });
    deepStrictEqual(JSON.parse(JSON.stringify(_data[0].valueEnd)),{ line: 2, character: 15 });

    deepStrictEqual(JSON.parse(JSON.stringify(_data[1].nameStart)),{ line: 3, character: 2 });
    deepStrictEqual(JSON.parse(JSON.stringify(_data[1].nameEnd)),{ line: 3, character: 7 });
    deepStrictEqual(JSON.parse(JSON.stringify(_data[1].valueStart)),{ line: 3, character: 9 });
    deepStrictEqual(JSON.parse(JSON.stringify(_data[1].valueEnd)),{ line: 3, character: 25 });
  });

  it('should report namespaces as attributes', () => {
    parser.write(Buffer.from(`<x xmlns:edi='http://ecommerce.example.org/schema'></x>`));
    deepStrictEqual(_event,SaxEventType.Attribute);
    deepStrictEqual(_data[0].name,'xmlns:edi');
    deepStrictEqual(_data[0].value,'http://ecommerce.example.org/schema');
  });

  it('should serialize to json as deepStrictEqualed', () => {
    parser.write(Buffer.from('<div class="testing"></div>'));
    deepStrictEqual(JSON.stringify(_data[0]),'{"nameStart":{"line":0,"character":5},"nameEnd":{"line":0,"character":10},' +
        '"valueStart":{"line":0,"character":12},"valueEnd":{"line":0,"character":19},"name":"class","value":"testing"}');
  });
});
