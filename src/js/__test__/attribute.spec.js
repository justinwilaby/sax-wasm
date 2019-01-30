const {SaxEventType, SAXParser}  = require('../../../lib');
const fs = require('fs');
const path = require('path');
const expect = require('expect.js');
const saxWasm = fs.readFileSync(path.resolve(__dirname, '../../../lib/sax-wasm.wasm'));

describe('SaxWasm', () => {
  let parser;
  let _event;
  let _data;

  before(async () => {
    parser = new SAXParser(SaxEventType.Attribute);

    parser.eventHandler = function (event, data) {
      _event = event;
      _data.push(data);
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
    parser.write('<body class="main"></body>');
    expect(_event).to.be(SaxEventType.Attribute);
    expect(_data.length).to.be(1);
    expect(_data[0].name).to.be('class');
    expect(_data[0].value).to.be('main');
  });

  it('should recognize attribute names when no spaces separate them', () => {
    parser.write('<component data-id="user_1234"key="23"/>');
    expect(_event).to.be(SaxEventType.Attribute);
    expect(_data[0].name).to.be('data-id');
    expect(_data[0].value).to.be('user_1234');
    expect(_data[1].name).to.be('key');
    expect(_data[1].value).to.be('23');
  });

  it('should preserve grapheme clusters as attribute values', () => {
    parser.write('<div id="👅"></div>');
    expect(_event).to.be(SaxEventType.Attribute);
    expect(_data[0].name).to.be('id');
    expect(_data[0].value).to.be('👅');
  });

  it('should provide the attribute value when the value is not quoted', () => {
    parser.write('<body app=buggyAngularApp></body>');
    expect(_event).to.be(SaxEventType.Attribute);
    expect(_data[0].name).to.be('app');
    expect(_data[0].value).to.be('buggyAngularApp');
  });

  it('should provide the attribute value when the value is a JSX expression', () => {
    parser.write('<Component props={() => { return this.props } }></Component>');
    expect(_event).to.be(SaxEventType.Attribute);
    expect(_data[0].name).to.be('props');
    expect(_data[0].value).to.be('() => { return this.props } ');
  });

  it('should report the correct start and end positions for attributes', () => {
    const html = `
<div 
  data-value="👅"
  class="grapheme cluster">
</div>`;

    parser.write(html);
    expect(_event).to.be(SaxEventType.Attribute);
    expect(_data[0].nameStart).to.eql({line: 2, character: 2});
    expect(_data[0].nameEnd).to.eql({line: 2, character: 12});
    expect(_data[0].valueStart).to.eql({line: 2, character: 14});
    expect(_data[0].valueEnd).to.eql({line: 2, character: 15});

    expect(_data[1].nameStart).to.eql({line: 3, character: 2});
    expect(_data[1].nameEnd).to.eql({line: 3, character: 7});
    expect(_data[1].valueStart).to.eql({line: 3, character: 9});
    expect(_data[1].valueEnd).to.eql({line: 3, character: 25});
  });

  it('should report namespaces as attributes', () => {
    parser.write(`<x xmlns:edi='http://ecommerce.example.org/schema'></x>`);
    expect(_event).to.be(SaxEventType.Attribute);
    expect(_data[0].name).to.be('xmlns:edi');
    expect(_data[0].value).to.be('http://ecommerce.example.org/schema');
  });

});
