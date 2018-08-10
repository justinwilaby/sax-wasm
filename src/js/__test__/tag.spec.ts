import {SaxEventType, SAXParser, Tag} from '../';
import * as fs from 'fs';
import * as path from 'path';

const saxWasm = fs.readFileSync(path.resolve(__dirname, '../../../lib/sax-wasm.wasm'));

describe('SaxWasm', () => {
  let parser: SAXParser;
  let _event: number;
  let _data: Tag[];
  beforeEach(async () => {
    parser = new SAXParser();
    parser.events = SaxEventType.OpenTagStart |
      SaxEventType.OpenTag |
      SaxEventType.CloseTag;

    _data = [] as Tag[];
    _event = 0;

    parser.eventHandler = function (event: SaxEventType, data: Tag) {
      _event |= event as number;
      _data.push(data);
    };
    return parser.prepareWasm(saxWasm);
  });

  it('should report the SaxEventType.OpenTagStart', () => {
    parser.write('<div class="myDiv">This is my div</div>');
    expect(_event & SaxEventType.OpenTagStart).toBeTruthy();
    expect(_data[0].name).toBe('div');
    expect(_data[0].attributes.length).toBe(0);
    expect(_data[0].text).toBe('');
    expect(_data[0].start).toEqual({line: 0, character: 0});
  });

  it('should report the SaxEventType.OpenTag', () => {
    parser.write('<div class="myDiv">This is my div</div>');
    expect(_event & SaxEventType.OpenTag).toBeTruthy();
    expect(_data[1].name).toBe('div');
    expect(_data[1].attributes.length).toBe(1);
    expect(_data[1].text).toBe('');
    expect(_data[1].start).toEqual({line: 0, character: 0});
    expect(_data[1].end).toEqual({line: 0, character: 0});
  });

  it('should report the SaxEventType.CloseTag', () => {
    parser.write('<div class="myDiv">This is my div</div>');
    expect(_event & SaxEventType.CloseTag).toBeTruthy();
    expect(_data[2].name).toBe('div');
    expect(_data[2].attributes.length).toBe(1);
    expect(_data[2].text).toBe('This is my div');
    expect(_data[2].start).toEqual({line: 0, character: 0});
    expect(_data[2].end).toEqual({line: 0, character: 39});
  });

  it('should report selfClosing tags correctly', () => {
    parser.events = SaxEventType.CloseTag;
    parser.write('<g><path d="M0,12.5 L50,12.5 L50,25 L0,25 L0,12.5z"/></g>');
    expect(_data[0].selfClosing).toBeTruthy();
    expect(_data[1].selfClosing).toBeFalsy();
  });

  it('should handle the BOM', () => {
    parser.events = SaxEventType.OpenTag;
    parser.write('\uFEFF<div></div>');
    expect(_event).toBe(SaxEventType.OpenTag);
    expect(_data[0].name).toBe('div');
  });

  it('should treat orphaned end tags as text', () => {
    parser.events = SaxEventType.Text;
    parser.write('<div><a href="http://github.com">GitHub</a></orphan></div>');
    expect(_event).toBe(SaxEventType.Text);
    expect(_data[1]).toBe('</orphan>')
  });
});
