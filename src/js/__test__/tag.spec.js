const {SaxEventType, SAXParser}  = require('../../../lib/');
const fs = require('fs');
const path = require('path');
const expect = require('expect.js');

const saxWasm = fs.readFileSync(path.resolve(__dirname, '../../../lib/sax-wasm.wasm'));

describe('SaxWasm', () => {
  let parser;
  let _event;
  let _data;
  beforeEach(async () => {
    parser = new SAXParser();
    parser.events = SaxEventType.OpenTagStart |
      SaxEventType.OpenTag |
      SaxEventType.CloseTag;

    _data = [];
    _event = 0;

    parser.eventHandler = function (event, data) {
      _event |= event;
      _data.push(data);
    };
    return parser.prepareWasm(saxWasm);
  });

  afterEach(() => {
    parser.end();
  });

  it('should report the SaxEventType.OpenTagStart', () => {
    parser.write('<div class="myDiv">This is my div</div>');
    expect(_event & SaxEventType.OpenTagStart).to.be(32);
    const [tag] = _data ;
    expect(tag.name).to.be('div');
    expect(tag.attributes.length).to.be(0);
    expect(tag.openStart).to.eql({line: 0, character: 0});
  });

  it('should report the SaxEventType.OpenTag', () => {
    parser.write('<div class="myDiv">This is my div</div>');
    expect(_event & SaxEventType.OpenTag).to.be(128);
    const [,tag] = _data ;
    expect(tag.name).to.be('div');
    expect(tag.attributes.length).to.be(1);
    expect(tag.openStart).to.eql({line: 0, character: 0});
    expect(tag.openEnd).to.eql({line: 0, character: 19});
  });

  it('should report the SaxEventType.CloseTag', () => {
    parser.write('<div class="myDiv">This is my div</div>');
    expect(_event & SaxEventType.CloseTag).to.be(256);
    const [,,tag] = _data ;
    expect(tag.name).to.be('div');
    expect(tag.attributes.length).to.be(1);
    expect(tag.openStart).to.eql({line: 0, character: 0});
    expect(tag.openEnd).to.eql({line: 0, character: 19});
    expect(tag.closeStart).to.eql({line: 0, character: 33});
    expect(tag.closeEnd).to.eql({line: 0, character: 39});
  });

  it('should report selfClosing tags correctly', () => {
    parser.events = SaxEventType.CloseTag;
    parser.write('<g><path d="M0,12.5 L50,12.5 L50,25 L0,25 L0,12.5z"/></g>');
    const [path, g] = _data ;
    expect(path.selfClosing).to.be(true);
    expect(g.selfClosing).to.be(false);
  });

  it('should handle the BOM', () => {
    parser.events = SaxEventType.OpenTag;
    parser.write('\uFEFF<div></div>');
    expect(_event).to.be(SaxEventType.OpenTag);
    const [tag] = _data ;
    expect(tag.name).to.be('div');
  });

  it('should treat orphaned close tags as text', () => {
    parser.events = SaxEventType.Text;
    parser.write('<div><a href="http://github.com">GitHub</a></orphan></div>');
    expect(_event).to.be(SaxEventType.Text);
    const [,text] = _data;
    expect(text.value).to.be('</orphan>');
  });

  it('should treat empty self-closing tags as tags', () => {
    parser.events = SaxEventType.OpenTag | SaxEventType.CloseTag;
    parser.write('<div></></div>');
    expect(_event & SaxEventType.OpenTag).to.be(128);
    expect(_event & SaxEventType.CloseTag).to.be(256);
    const [, openTag, closeTag] = _data ;
    expect(openTag.name).to.be('');
    expect(closeTag.name).to.be('');
  });
});
