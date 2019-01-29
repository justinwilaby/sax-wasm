import {SaxEventType, SAXParser, Tag, Text} from '../saxWasm';
import * as fs from 'fs';
import * as path from 'path';

const saxWasm = fs.readFileSync(path.resolve(__dirname, '../../../lib/sax-wasm.wasm'));

describe('SaxWasm', () => {
  let parser: SAXParser;
  let _event: number;
  let _data: any[];
  beforeEach(async () => {
    parser = new SAXParser();
    parser.events = SaxEventType.OpenTagStart |
      SaxEventType.OpenTag |
      SaxEventType.CloseTag;

    _data = [];
    _event = 0;

    parser.eventHandler = function (event: SaxEventType, data: Tag) {
      _event |= event as number;
      _data.push(data);
    };
    return parser.prepareWasm(saxWasm);
  });

  afterEach(() => {
    parser.end();
  });

  it('should report the SaxEventType.OpenTagStart', () => {
    parser.write('<div class="myDiv">This is my div</div>');
    expect(_event & SaxEventType.OpenTagStart).toBeTruthy();
    const [tag] = _data as Tag[];
    expect(tag.name).toBe('div');
    expect(tag.attributes.length).toBe(0);
    expect(tag.openStart).toEqual({line: 0, character: 0});
  });

  it('should report the SaxEventType.OpenTag', () => {
    parser.write('<div class="myDiv">This is my div</div>');
    expect(_event & SaxEventType.OpenTag).toBeTruthy();
    const [,tag] = _data as Tag[];
    expect(tag.name).toBe('div');
    expect(tag.attributes.length).toBe(1);
    expect(tag.openStart).toEqual({line: 0, character: 0});
    expect(tag.openEnd).toEqual({line: 0, character: 19});
  });

  it('should report the SaxEventType.CloseTag', () => {
    parser.write('<div class="myDiv">This is my div</div>');
    expect(_event & SaxEventType.CloseTag).toBeTruthy();
    const [,,tag] = _data as Tag[];
    expect(tag.name).toBe('div');
    expect(tag.attributes.length).toBe(1);
    expect(tag.openStart).toEqual({line: 0, character: 0});
    expect(tag.openEnd).toEqual({line: 0, character: 19});
    expect(tag.closeStart).toEqual({line: 0, character: 33});
    expect(tag.closeEnd).toEqual({line: 0, character: 39});
  });

  it('should report selfClosing tags correctly', () => {
    parser.events = SaxEventType.CloseTag;
    parser.write('<g><path d="M0,12.5 L50,12.5 L50,25 L0,25 L0,12.5z"/></g>');
    const [path, g] = _data as Tag[];
    expect(path.selfClosing).toBeTruthy();
    expect(g.selfClosing).toBeFalsy();
  });

  it('should handle the BOM', () => {
    parser.events = SaxEventType.OpenTag;
    parser.write('\uFEFF<div></div>');
    expect(_event).toBe(SaxEventType.OpenTag);
    const [tag] = _data as Tag[];
    expect(tag.name).toBe('div');
  });

  it('should treat orphaned close tags as text', () => {
    parser.events = SaxEventType.Text;
    parser.write('<div><a href="http://github.com">GitHub</a></orphan></div>');
    expect(_event).toBe(SaxEventType.Text);
    const [,text] = _data as Text[];
    expect(text.value).toBe('</orphan>');
  });

  it('should treat empty self-closing tags as tags', () => {
    parser.events = SaxEventType.OpenTag | SaxEventType.CloseTag;
    parser.write('<div></></div>');
    expect(_event & SaxEventType.OpenTag).toBeTruthy();
    expect(_event & SaxEventType.CloseTag).toBeTruthy();
    const [, openTag, closeTag] = _data as Tag[];
    expect(openTag.name).toBe('');
    expect(closeTag.name).toBe('');
  });
});
