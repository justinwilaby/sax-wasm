import { Attribute, AttributeType, Detail, Reader, SaxEventType, SAXParser } from '../saxWasm'
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { deepStrictEqual, equal } from 'assert';

const saxWasm = readFileSync(resolve(__dirname, '../../../lib/sax-wasm.wasm'));

describe('SaxWasm', () => {
  let parser: SAXParser;
  let _event: SaxEventType;
  let _data: Attribute[];

  beforeAll(async () => {
    parser = new SAXParser(SaxEventType.Attribute);

    parser.eventHandler = function (event: SaxEventType, data: Reader<Detail>) {
      _event = event;
      _data.push(data.toJSON() as Attribute);
    };
    return parser.prepareWasm(saxWasm);
  });

  beforeEach(() => {
    _data = [];
  });

  afterEach(() => {
    parser.end();
  });

  it('should recognize boolean attributes', () => {
    parser.write(Buffer.from('<button disabled class="primary-btn"></button>'));
    deepStrictEqual(_event, SaxEventType.Attribute);
    deepStrictEqual(_data.length, 2);
    const expected = [
      { name: 'disabled', value: '' },
      { name: 'class', value: 'primary-btn' },
    ];
    expected.forEach((attr, i) => {
      deepStrictEqual(_data[i].name.value, attr.name);
      deepStrictEqual(_data[i].value.value, attr.value);
    });
  })

  it('should recognize attribute with empty value', () => {
    parser.write(Buffer.from('<body class=""></body>'));
    deepStrictEqual(_event, SaxEventType.Attribute);
    deepStrictEqual(_data.length, 1);
    deepStrictEqual(_data[0].name.value, 'class');
    deepStrictEqual(_data[0].value.value, '');
    deepStrictEqual(_data[0].byteOffsets, {start: 6, end: 14});
    equal(_data[0].type, AttributeType.DoubleQuoted);
  });

  it('should not include whitespace in the attribute\'s nameEnd value', () => {
    parser.write(Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>\n<plugin\n    version       =   "1.0.0"   >\n</plugin>`));
    deepStrictEqual(_event, SaxEventType.Attribute);
    deepStrictEqual(_data.length, 1);
    deepStrictEqual(_data[0].name.value, 'version');
    deepStrictEqual(_data[0].value.value, '1.0.0');
    deepStrictEqual(_data[0].name.end.character, 11);
    deepStrictEqual(_data[0].byteOffsets, {start: 51, end: 76});
  })

  it('should recognize attribute names', () => {
    parser.write(Buffer.from(`<body class='main' id=1234></body>`));
    deepStrictEqual(_event, SaxEventType.Attribute);
    deepStrictEqual(_data.length, 2);
    deepStrictEqual(_data[0].name.value, 'class');
    deepStrictEqual(_data[0].value.value, 'main');
    equal(_data[0].type, AttributeType.SingleQuoted);
    equal(_data[1].type, AttributeType.NoQuotes);
  });

  it('should recognize attribute names when no spaces separate them', () => {
    parser.write(Buffer.from('<component data-id="user_1234"key="23" disabled />'));
    deepStrictEqual(_event, SaxEventType.Attribute);
    const expected = [
      { name: 'data-id', value: 'user_1234' },
      { name: 'key', value: '23' },
      { name: 'disabled', value: '' },
    ];
    deepStrictEqual(_data.length, expected.length);
    expected.forEach((attr, i) => {
      deepStrictEqual(_data[i].name.value, attr.name);
      deepStrictEqual(_data[i].value.value, attr.value);
    });
  });

  it('should preserve grapheme clusters as attribute values', () => {
    parser.write(Buffer.from('<div id="👅"></div>'));
    deepStrictEqual(_event, SaxEventType.Attribute);
    deepStrictEqual(_data.length, 1);
    deepStrictEqual(_data[0].name.value, 'id');
    deepStrictEqual(_data[0].value.value, '👅');
  });

  it('should provide the attribute value when the value is not quoted', () => {
    parser.write(Buffer.from('<body app="buggyAngularApp=19"></body>'));
    deepStrictEqual(_event, SaxEventType.Attribute);
    deepStrictEqual(_data.length, 1);
    deepStrictEqual(_data[0].name.value, 'app');
    deepStrictEqual(_data[0].value.value, 'buggyAngularApp=19');
  });

  it('should provide the attribute value when the value is a JSX expression', () => {
    parser.write(Buffer.from('<Component props={() => { return this.props } }></Component>'));
    deepStrictEqual(_event, SaxEventType.Attribute);
    deepStrictEqual(_data.length, 1);
    deepStrictEqual(_data[0].name.value, 'props');
    deepStrictEqual(_data[0].value.value, '() => { return this.props } ');
  });

  it('should report the correct start and end positions for attributes', () => {
    const html = `\n<div\n  data-value="👅"\n  class="grapheme cluster">\n</div>`;

    parser.write(Buffer.from(html));
    deepStrictEqual(_event, SaxEventType.Attribute);
    const expected = [
      { name: 'data-value', value: '👅' },
      { name: 'class', value: 'grapheme cluster' },
    ];
    deepStrictEqual(_data.length, expected.length);
    expected.forEach((attr, i) => {
      deepStrictEqual(_data[i].name.value, attr.name);
      deepStrictEqual(_data[i].value.value, attr.value);
    });
    deepStrictEqual(JSON.parse(JSON.stringify(_data[0].name.start)), { line: 2, character: 2 });
    deepStrictEqual(JSON.parse(JSON.stringify(_data[0].name.end)), { line: 2, character: 12 });
    deepStrictEqual(JSON.parse(JSON.stringify(_data[0].value.start)), { line: 2, character: 14 });
    deepStrictEqual(JSON.parse(JSON.stringify(_data[0].value.end)), { line: 2, character: 16 });

    deepStrictEqual(JSON.parse(JSON.stringify(_data[1].name.start)), { line: 3, character: 2 });
    deepStrictEqual(JSON.parse(JSON.stringify(_data[1].name.end)), { line: 3, character: 7 });
    deepStrictEqual(JSON.parse(JSON.stringify(_data[1].value.start)), { line: 3, character: 9 });
    deepStrictEqual(JSON.parse(JSON.stringify(_data[1].value.end)), { line: 3, character: 25 });
  });

  it('should report namespaces as attributes', () => {
    parser.write(Buffer.from(`<x xmlns:edi='http://ecommerce.example.org/schema'></x>`));
    deepStrictEqual(_event, SaxEventType.Attribute);
    deepStrictEqual(_data.length, 1);
    deepStrictEqual(_data[0].name.value, 'xmlns:edi');
    deepStrictEqual(_data[0].value.value, 'http://ecommerce.example.org/schema');
  });

  it('should serialize to json as deepStrictEqualed', () => {
    parser.write(Buffer.from('<div class="testing"></div>'));
    deepStrictEqual(_data.length, 1);
    deepStrictEqual(JSON.stringify(_data[0]), '{"name":{"start":{"line":0,"character":5},"end":{"line":0,"character":10},"value":"class","byteOffsets":{"start":5,"end":10}},"value":{"start":{"line":0,"character":12},"end":{"line":0,"character":19},"value":"testing","byteOffsets":{"start":12,"end":19}},"type":8,"byteOffsets":{"start":5,"end":20}}');
  });

  it('should correctly parse attribute values enclosed in single quotes', () => {
    parser.write(Buffer.from(`<element attribute1='value1' attribute2='value2'></element>`));
    deepStrictEqual(_event, SaxEventType.Attribute);
    const expected = [
      { name: 'attribute1', value: 'value1' },
      { name: 'attribute2', value: 'value2' },
    ];
    deepStrictEqual(_data.length, expected.length);
    expected.forEach((attr, i) => {
      deepStrictEqual(_data[i].name.value, attr.name);
      deepStrictEqual(_data[i].value.value, attr.value);
    });
  });

  it('should correctly parse attributes when tabs are used as whitespace', () => {
    parser.write(Buffer.from(`<root\n\txmlns="http://example.com/default"\n\txmlns:ns1="http://example.com/ns1"\n\txmlns:ns2="http://example.com/ns2">\n\n\t\t<ns1:element1\n\t\t\tattribute1="value1"\n\t\t\tattribute2="value2">\n\t\t\t\t\t\t<ns2:childElement\n\t\t\t\t\t\t\tns2:childAttribute="childValue">\n\t\t\t\t\t\t\t\t\tContent of child element\n\t\t\t\t\t\t</ns2:childElement>\n\t\t</ns1:element1>\n\n\t\t<element2\n\t\t\tattribute3="value3"\n\t\t\tns1:attribute4="value4">\n\t\t\t\t\t<subElement>Text content</subElement>\n\t\t</element2>\n</root>`));
    deepStrictEqual(_event, SaxEventType.Attribute);
    const expected = [
      { name: 'xmlns', value: 'http://example.com/default' },
      { name: 'xmlns:ns1', value: 'http://example.com/ns1' },
      { name: 'xmlns:ns2', value: 'http://example.com/ns2' },
      { name: 'attribute1', value: 'value1' },
      { name: 'attribute2', value: 'value2' },
      { name: 'ns2:childAttribute', value: 'childValue' },
      { name: 'attribute3', value: 'value3' },
      { name: 'ns1:attribute4', value: 'value4' },
    ];
    deepStrictEqual(_data.length, expected.length);
    expected.forEach((attr, i) => {
      deepStrictEqual(_data[i].name.value, attr.name);
      deepStrictEqual(_data[i].value.value, attr.value);
    });
  });

  it('should correctly parse attribute with single character as name (no value)', () => {
    parser.write(Buffer.from(`<element attribute1='value1'a attribute3='value3'></element>`));
    deepStrictEqual(_event, SaxEventType.Attribute);
    const expected = [
      { name: 'attribute1', value: 'value1' },
      { name: 'a', value: '' },
      { name: 'attribute3', value: 'value3' },
    ];
    deepStrictEqual(_data.length, expected.length);
    expected.forEach((attr, i) => {
      deepStrictEqual(_data[i].name.value, attr.name);
      deepStrictEqual(_data[i].value.value, attr.value);
    });
  });

  it('should correctly parse attribute with single character as name (with value)', () => {
    parser.write(Buffer.from(`<element attribute1='value1'a="value2" attribute3='value3'></element>`));
    deepStrictEqual(_event, SaxEventType.Attribute);
    const expected = [
      { name: 'attribute1', value: 'value1' },
      { name: 'a', value: 'value2' },
      { name: 'attribute3', value: 'value3' },
    ];
    deepStrictEqual(_data.length, expected.length);
    expected.forEach((attr, i) => {
      deepStrictEqual(_data[i].name.value, attr.name);
      deepStrictEqual(_data[i].value.value, attr.value);
    });
  });

  it('should correctly parse unquoted attribute with following attribute', () => {
    parser.write(Buffer.from(`<element attribute1=value1 attribute2='value2'></element>`));
    deepStrictEqual(_event, SaxEventType.Attribute);
    const expected = [
      { name: 'attribute1', value: 'value1' },
      { name: 'attribute2', value: 'value2' },
    ];
    deepStrictEqual(_data.length, expected.length);
    expected.forEach((attr, i) => {
      deepStrictEqual(_data[i].name.value, attr.name);
      deepStrictEqual(_data[i].value.value, attr.value);
    });
  });

  it('should report correct end position for second single char attribute', () => {
    const xml = `<div a\n    b\n    attributeWithValue="xyz">\n</div>`;
    parser.write(Buffer.from(xml));
    deepStrictEqual(_event, SaxEventType.Attribute);
    deepStrictEqual(_data.length, 3);

    const attrA = _data[0];
    deepStrictEqual(attrA.name.value, 'a');
    deepStrictEqual(JSON.parse(JSON.stringify(attrA.name.start)), { line: 0, character: 5 });
    deepStrictEqual(JSON.parse(JSON.stringify(attrA.name.end)), { line: 0, character: 6 });

    const attrB = _data[1];
    deepStrictEqual(attrB.name.value, 'b');
    deepStrictEqual(JSON.parse(JSON.stringify(attrB.name.start)), { line: 1, character: 4 });
    deepStrictEqual(JSON.parse(JSON.stringify(attrB.name.end)), { line: 1, character: 5 });
  });
});
