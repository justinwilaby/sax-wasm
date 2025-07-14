import { Detail, Reader, SaxEventType, SAXParser, Tag } from '../saxWasm';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { deepEqual, equal, strictEqual } from 'assert';

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

    parser.eventHandler = function (event: SaxEventType, data:Reader<Detail>) {
      _event |= event as number;
      _data.push(data.toJSON() as Tag);
    };
    return parser.prepareWasm(saxWasm);
  });

  afterEach(() => {
    parser.end();
  });

  it('should report the SaxEventType.OpenTagStart', () => {
    parser.write(Buffer.from(`<div class="myDiv">This is my div</div>`));
    equal(_event & SaxEventType.OpenTagStart, 32);
    const [tag] = _data;
    equal(tag.name, 'div');
    equal(tag.attributes.length, 0);
    deepEqual(tag.openStart, { line: 0, character: 0 });
  });

  it('should report the SaxEventType.OpenTag', () => {
    parser.write(Buffer.from('<div class="myDiv">This is my div</div>'));
    equal(_event & SaxEventType.OpenTag, 128);
    const [, tag] = _data;
    equal(tag.name, 'div');
    equal(tag.attributes.length, 1);
    deepEqual(tag.openStart, { line: 0, character: 0 });
    deepEqual(tag.openEnd, { line: 0, character: 19 });
  });

  it('should report the SaxEventType.CloseTag', () => {
    parser.write(Buffer.from('<div class="myDiv">This is my div</div>'));
    equal(_event & SaxEventType.CloseTag, 256);
    const [, , tag] = _data;
    equal(tag.name, 'div');
    equal(tag.attributes.length, 1);
    equal(tag.attributes[0].name.value, 'class');
    equal(tag.attributes[0].value.value, 'myDiv');
    equal(tag.textNodes.length, 1);
    equal(tag.textNodes[0].value, 'This is my div');
    deepEqual(tag.openStart, { line: 0, character: 0 });
    deepEqual(tag.openEnd, { line: 0, character: 19 });
    deepEqual(tag.closeStart, { line: 0, character: 33 });
    deepEqual(tag.closeEnd, { line: 0, character: 39 });
  });

  it('should report selfClosing tags correctly', () => {
    parser.events = SaxEventType.CloseTag;
    parser.write(Buffer.from('<g><path d="M0,12.5 L50,12.5 L50,25 L0,25 L0,12.5z"/></g>'));
    const [path, g] = _data;
    deepEqual(path.selfClosing, true);
    deepEqual(g.selfClosing, false);
  });

  it('should report selfClosing tags correctly when there is a space after the slash', () => {
    parser.events = SaxEventType.CloseTag;

    parser.write(Buffer.from(`<Div>
	<Div type="JS" viewName="myapp.view.Home" />
	<Div type="JSON" viewName="myapp.view.Home" />
	<Div type="HTML" viewName="myapp.view.Home" />
	<Div type="Template" viewName="myapp.view.Home" />

	<AnotherSelfClosingDiv type="Template" viewName="myapp.view.Home" />
</Div>`));
    const [, div, div2, div3, div4, div5] = _data;
    deepEqual(div.selfClosing, true);
    deepEqual(div2.selfClosing, true);
    deepEqual(div3.selfClosing, true);
    deepEqual(div4.selfClosing, true);
    deepEqual(div5.selfClosing, false);
  });

  it('should handle the BOM', () => {
    parser.events = SaxEventType.OpenTag;
    parser.write(Buffer.from('\uFEFF<div></div>'));
    deepEqual(_event, SaxEventType.OpenTag);
    const [tag] = _data;
    deepEqual(tag.name, 'div');
  });

  it('should treat orphaned close tags as text', () => {
    parser.events = SaxEventType.Text;
    parser.write(Buffer.from('<div><a href="http://github.com">GitHub</a></orphan></div>'));
    deepEqual(_event, SaxEventType.Text);
    const [, text] = _data;
    deepEqual(text.value, '</orphan>');
  });

  it('should treat empty self-closing tags as orphans', () => {
    parser.events = SaxEventType.OpenTag | SaxEventType.CloseTag | SaxEventType.Text;
    parser.write(Buffer.from('<div></></div>'));
    deepEqual(_event & SaxEventType.OpenTag, 128);
    deepEqual(_event & SaxEventType.CloseTag, 256);
    deepEqual(_event & SaxEventType.Text, 1);
    const [openTag, orphan, closeTag] = _data;
    deepEqual(openTag.name, 'div');
    deepEqual(orphan.value, '</>');
    deepEqual(closeTag.name, 'div');
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

  it('should handle tag write boundaries correctly', async () => {
    // Rust: test_tag_write_boundary
    const str = '<div><a href="http://github.com">GitHub</a></orphan></div>';
    const bytes = Buffer.from(str);
    for (let i = 1; i < bytes.length; i++) {
      parser = new SAXParser();
      parser.events = SaxEventType.CloseTag | SaxEventType.Text;
      _data = [];
      parser.eventHandler = function (event: SaxEventType, data: Reader<Detail>) {
        _data.push(data.toJSON() as any);
      };
      await parser.prepareWasm(saxWasm);
      parser.write(bytes.subarray(0, i));
      parser.write(bytes.subarray(i));
      parser.end();
      const tags = _data.filter((d) => d.name);
      const texts = _data.filter((d) => d.value);
      deepEqual(tags.length, 2, `At iteration i=${i}, expected exactly 2 tags, got ${tags.length}`);
      deepEqual(texts.length, 2, `At iteration i=${i}, expected exactly 2 text elements, got ${texts.length}`);
      deepEqual(texts[0].value, 'GitHub', `At iteration i=${i}, first text value should be 'GitHub', got ${texts[0].value}`);
      deepEqual(texts[1].value, '</orphan>', `At iteration i=${i}, second text value should be '</orphan>', got ${texts[1].value}`);
      deepEqual(tags[0].name, 'a', `At iteration i=${i}, first tag name should be 'a', got ${tags[0].name}`);
      deepEqual(tags[1].name, 'div', `At iteration i=${i}, second tag name should be 'div', got ${tags[1].name}`);
    }
  });

  it('should handle comment write boundaries correctly', async () => {
    // Rust: test_comment_write_boundary
    const str = '<!--some comment here-->';
    const bytes = Buffer.from(str);
    for (let i = 1; i < bytes.length; i++) {
      parser = new SAXParser();
      parser.events = SaxEventType.Comment;
      _data = [];
      parser.eventHandler = function (event: SaxEventType, data: Reader<Detail>) {
        _data.push(data.toJSON() as any);
      };
      await parser.prepareWasm(saxWasm);
      parser.write(bytes.subarray(0, i));
      parser.write(bytes.subarray(i));
      parser.end();
      const comments = _data.filter((d) => d.value);
      deepEqual(comments.length, 1, `At iteration i=${i}, expected exactly one comment, got ${comments.length}`);
      deepEqual(comments[0].value, 'some comment here', `At iteration i=${i}, comment content should be 'some comment here', got ${comments[0].value}`);
    }
  });

  it('should handle attribute value write boundaries correctly', async () => {
    // Rust: test_attribute_value_write_boundary
    const str = '<text top="100.00" />';
    const bytes = Buffer.from(str);
    for (let i = 1; i < bytes.length; i++) {
      parser = new SAXParser();
      parser.events = SaxEventType.Attribute;
      _data = [];
      parser.eventHandler = function (event: SaxEventType, data: Reader<Detail>) {
        _data.push(data.toJSON() as any);
      };
      await parser.prepareWasm(saxWasm);
      parser.write(bytes.subarray(0, i));
      parser.write(bytes.subarray(i));
      parser.end();
      const attrs = _data.filter((d: any) => d.name && d.value && typeof d.value === 'object' && typeof d.value.value === 'string');
      deepEqual(attrs.length, 1, `At iteration i=${i}, Expected exactly one attribute, got ${attrs.length}`);
      deepEqual((attrs[0].value as any).value, '100.00', `At iteration i=${i}, Expected attribute value to be 100.00, got ${(attrs[0].value as any).value}`);
      deepEqual((attrs[0].name as any).value, 'top', `At iteration i=${i}, Expected attribute name to be top, got ${(attrs[0].name as any).value}`);
    }
  });

  it('should handle cdata write boundaries correctly', async () => {
    // Rust: test_cdata_write_boundary
    const str = '<div><![CDATA[something]]>';
    const bytes = Buffer.from(str);
    for (let i = 1; i < bytes.length; i++) {
      parser = new SAXParser();
      parser.events = SaxEventType.Cdata;
      _data = [];
      parser.eventHandler = function (event: SaxEventType, data: Reader<Detail>) {
        _data.push(data.toJSON() as any);
      };
      await parser.prepareWasm(saxWasm);
      parser.write(bytes.subarray(0, i));
      parser.write(bytes.subarray(i));
      parser.end();
      const texts = _data.filter((d) => d.value);
      deepEqual(texts.length, 1, `At iteration i=${i}, expected exactly one text element, got ${texts.length}`);
      deepEqual(texts[0].value, 'something', `At iteration i=${i}, CDATA content should be 'something', got ${texts[0].value}`);
    }
  });

  it('should handle comment write boundary 2 correctly', async () => {
    const str = `<!--lit-part cI7PGs8mxHY=-->
        <p><!--lit-part-->hello<!--/lit-part--></p>
        <!--lit-part BRUAAAUVAAA=--><?><!--/lit-part-->
        <!--lit-part--><!--/lit-part-->
        <p>more</p>
        <!--/lit-part-->`;

    const bytes = Buffer.from(str);
    for (let i = 1; i < bytes.byteLength; i++) {
      _data = [];

      parser = new SAXParser();
      await parser.prepareWasm(saxWasm);
      parser.events = SaxEventType.Comment;
      parser.eventHandler = function (event: SaxEventType, data: Reader<Detail>) {
        _data.push(data.toJSON() as any);
      };

      parser.write(bytes)
      // parser.write(bytes.subarray(0, i));
      // parser.write(bytes.subarray(i));
      parser.end();
      const char = String.fromCharCode(bytes[i]);
      const comments = _data.filter((d) => d.value);
      deepEqual(comments.length, 8, `At iteration i=${i}, expected exactly 8 comments, got ${comments.length}`);
      deepEqual(comments[0].value, 'lit-part cI7PGs8mxHY=', `At iteration i=${i}, first comment content should be 'lit-part cI7PGs8mxHY=', got ${comments[0].value}`);
    }
  });
});
