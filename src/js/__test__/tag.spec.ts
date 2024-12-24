import { Detail, SaxEventType, SAXParser, Tag } from '../saxWasm';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { deepStrictEqual, strictEqual } from 'assert';

const saxWasm = readFileSync(resolve(__dirname, '../../../lib/sax-wasm.wasm'));

describe('SaxWasm', () => {
  let parser: SAXParser;
  let _event: number;
  let _data: Tag[];

  beforeEach(async () => {
    parser = new SAXParser();
    parser.events = SaxEventType.OpenTagStart |
        SaxEventType.OpenTag |
        SaxEventType.CloseTag;

    _data = [];
    _event = 0;

    parser.eventHandler = function (event, data) {
      _event |= event as number;
      _data.push(data as Tag);
    };
    return parser.prepareWasm(saxWasm);
  });

  afterEach(() => {
    parser.end();
  });

  it('should report the SaxEventType.OpenTagStart', () => {
    parser.write(Buffer.from('<div class="myDiv">This is my div</div>'));
    deepStrictEqual(_event & SaxEventType.OpenTagStart, 32);
    const [tag] = _data;
    deepStrictEqual(tag.name, 'div');
    deepStrictEqual(tag.attributes.length, 0);
    deepStrictEqual(JSON.parse(JSON.stringify(tag.openStart)), { line: 0, character: 0 });
  });

  it('should report the SaxEventType.OpenTag', () => {
    parser.write(Buffer.from('<div class="myDiv">This is my div</div>'));
    deepStrictEqual(_event & SaxEventType.OpenTag, 128);
    const [, tag] = _data;
    deepStrictEqual(tag.name, 'div');
    deepStrictEqual(tag.attributes.length, 1);
    deepStrictEqual(JSON.parse(JSON.stringify(tag.openStart)), { line: 0, character: 0 });
    deepStrictEqual(JSON.parse(JSON.stringify(tag.openEnd)), { line: 0, character: 19 });
  });

  it('should report the SaxEventType.CloseTag', () => {
    parser.write(Buffer.from('<div class="myDiv">This is my div</div>'));
    deepStrictEqual(_event & SaxEventType.CloseTag, 256);
    const [, , tag] = _data;
    deepStrictEqual(tag.name, 'div');
    deepStrictEqual(tag.attributes.length, 1);
    deepStrictEqual('' + tag.attributes[0].name, 'class');
    deepStrictEqual('' + tag.attributes[0].value, 'myDiv');
    deepStrictEqual(tag.textNodes.length, 1);
    deepStrictEqual('' + tag.textNodes[0].value, 'This is my div');
    deepStrictEqual(JSON.parse(JSON.stringify(tag.openStart)), { line: 0, character: 0 });
    deepStrictEqual(JSON.parse(JSON.stringify(tag.openEnd)), { line: 0, character: 19 });
    deepStrictEqual(JSON.parse(JSON.stringify(tag.closeStart)), { line: 0, character: 33 });
    deepStrictEqual(JSON.parse(JSON.stringify(tag.closeEnd)), { line: 0, character: 39 });
    deepStrictEqual(JSON.stringify(tag), '{"openStart":{"line":0,"character":0},"openEnd":{"line":0,"character":19},"closeStart":{"line":0,"character":33},"closeEnd":{"line":0,"character":39},"name":"div","attributes":[{"name":{"start":{"line":0,"character":5},"end":{"line":0,"character":10},"value":"class"},"value":{"start":{"line":0,"character":12},"end":{"line":0,"character":17},"value":"myDiv"},"type":0}],"textNodes":[{"start":{"line":0,"character":19},"end":{"line":0,"character":33},"value":"This is my div"}],"selfClosing":false}');
  });

  it('should report selfClosing tags correctly', () => {
    parser.events = SaxEventType.CloseTag;
    parser.write(Buffer.from('<g><path d="M0,12.5 L50,12.5 L50,25 L0,25 L0,12.5z"/></g>'));
    const [path, g] = _data;
    deepStrictEqual(path.selfClosing, true);
    deepStrictEqual(g.selfClosing, false);
  });

  it('should handle the BOM', () => {
    parser.events = SaxEventType.OpenTag;
    parser.write(Buffer.from('\uFEFF<div></div>'));
    deepStrictEqual(_event, SaxEventType.OpenTag);
    const [tag] = _data;
    deepStrictEqual(tag.name, 'div');
  });

  it('should treat orphaned close tags as text', () => {
    parser.events = SaxEventType.Text;
    parser.write(Buffer.from('<div><a href="http://github.com">GitHub</a></orphan></div>'));
    deepStrictEqual(_event, SaxEventType.Text);
    const [, text] = _data;
    deepStrictEqual(text.value, '</orphan>');
  });

  it('should treat empty self-closing tags as tags', () => {
    parser.events = SaxEventType.OpenTag | SaxEventType.CloseTag;
    parser.write(Buffer.from('<div></></div>'));
    deepStrictEqual(_event & SaxEventType.OpenTag, 128);
    deepStrictEqual(_event & SaxEventType.CloseTag, 256);
    const [, openTag, closeTag] = _data;
    deepStrictEqual(openTag.name, '');
    deepStrictEqual(closeTag.name, '');
  });

  it('should continue to parse when encountering a question mark where a tag name should be', () => {
    const doc = `<!--lit-part cI7PGs8mxHY=-->
      <p><!--lit-part-->hello<!--/lit-part--></p>
      <!--lit-part BRUAAAUVAAA=--><?><!--/lit-part-->
      <!--lit-part--><!--/lit-part-->
      <p>more</p>
    <!--/lit-part-->`;
    parser.write(Buffer.from(doc));
    strictEqual(_data.length, 6);
    strictEqual(_data[5].textNodes.length, 1);
    strictEqual(_data[5].textNodes[0].value, 'more')
  });

  it('should recognize the emojis as expected', () => {
      const doc = '📚<div href="./123/123">hey there</div>';
      parser.write(Buffer.from(doc));
      const {start, end} = _data[2].attributes[0].value;
      strictEqual(doc.slice(start.character, end.character), './123/123');
  });
});
