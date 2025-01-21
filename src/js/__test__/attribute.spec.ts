import { Attribute, Detail, Reader, SaxEventType, SAXParser } from '../saxWasm'
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { deepStrictEqual } from 'assert';

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
    deepStrictEqual(_data[0].name.value, 'disabled');
    deepStrictEqual(_data[0].value.value, '');
  })

  it('should not include whitespace in the attribute\'s nameEnd value', () => {
    parser.write(Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<plugin
    version       =   "1.0.0"   >
</plugin>`));
    deepStrictEqual(_event, SaxEventType.Attribute);
    deepStrictEqual(_data.length, 1);
    deepStrictEqual(_data[0].name.value, 'version');
    deepStrictEqual(_data[0].name.end.character, 11);
  })

  it('should recognize attribute names', () => {
    parser.write(Buffer.from('<body class="main"></body>'));
    deepStrictEqual(_event, SaxEventType.Attribute);
    deepStrictEqual(_data.length, 1);
    deepStrictEqual(_data[0].name.value, 'class');
    deepStrictEqual(_data[0].value.value, 'main');
  });

  it('should recognize attribute names when no spaces separate them', () => {
    parser.write(Buffer.from('<component data-id="user_1234"key="23" disabled />'));
    deepStrictEqual(_event, SaxEventType.Attribute);
    deepStrictEqual(_data[0].name.value, 'data-id');
    deepStrictEqual(_data[0].value.value, 'user_1234');
    deepStrictEqual(_data[1].name.value, 'key');
    deepStrictEqual(_data[1].value.value, '23');
  });

  it('should preserve grapheme clusters as attribute values', () => {
    parser.write(Buffer.from('<div id="👅"></div>'));
    deepStrictEqual(_event, SaxEventType.Attribute);
    deepStrictEqual(_data[0].name.value, 'id');
    deepStrictEqual(_data[0].value.value, '👅');
  });

  it('should provide the attribute value when the value is not quoted', () => {
    parser.write(Buffer.from('<body app="buggyAngularApp=19"></body>'));
    deepStrictEqual(_event, SaxEventType.Attribute);
    deepStrictEqual(_data[0].name.value, 'app');
    deepStrictEqual(_data[0].value.value, 'buggyAngularApp=19');
  });

  it('should provide the attribute value when the value is a JSX expression', () => {
    parser.write(Buffer.from('<Component props={() => { return this.props } }></Component>'));
    deepStrictEqual(_event, SaxEventType.Attribute);
    deepStrictEqual(_data[0].name.value, 'props');
    deepStrictEqual(_data[0].value.value, '() => { return this.props } ');
  });

  it('should report the correct start and end positions for attributes', () => {
    const html = `
<div
  data-value="👅"
  class="grapheme cluster">
</div>`;

    parser.write(Buffer.from(html));
    deepStrictEqual(_event, SaxEventType.Attribute);
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
    deepStrictEqual(_data[0].name.value, 'xmlns:edi');
    deepStrictEqual(_data[0].value.value, 'http://ecommerce.example.org/schema');
  });

  it('should serialize to json as deepStrictEqualed', () => {
    parser.write(Buffer.from('<div class="testing"></div>'));
    deepStrictEqual(JSON.stringify(_data[0]), '{"name":{"start":{"line":0,"character":5},"end":{"line":0,"character":10},"value":"class"},"value":{"start":{"line":0,"character":12},"end":{"line":0,"character":19},"value":"testing"},"type":0}');
  });

  it('should correctly parse attribute values enclosed in single quotes', () => {
    parser.write(Buffer.from(`<element attribute1='value1' attribute2='value2'></element>`));
    deepStrictEqual(_event, SaxEventType.Attribute);
    deepStrictEqual(_data[0].name.value, 'attribute1');
    deepStrictEqual(_data[0].value.value, 'value1');
    deepStrictEqual(_data[1].name.value, 'attribute2');
    deepStrictEqual(_data[1].value.value, 'value2');
  });

  it('should correctly parse attributes when tabs are used as whitespace', () => {
    parser.write(Buffer.from(`<root
	xmlns="http://example.com/default"
	xmlns:ns1="http://example.com/ns1"
	xmlns:ns2="http://example.com/ns2">

		<ns1:element1
			attribute1="value1"
			attribute2="value2">
				<ns2:childElement
					ns2:childAttribute="childValue">
						Content of child element
				</ns2:childElement>
		</ns1:element1>

		<element2
			attribute3="value3"
			ns1:attribute4="value4">
				<subElement>Text content</subElement>
		</element2>
</root>`));
    deepStrictEqual(_event, SaxEventType.Attribute);
    deepStrictEqual(_data[0].name.value, 'xmlns');
    deepStrictEqual(_data[0].value.value, 'http://example.com/default');
    deepStrictEqual(_data[1].name.value, 'xmlns:ns1');
    deepStrictEqual(_data[1].value.value, 'http://example.com/ns1');
    deepStrictEqual(_data[2].name.value, 'xmlns:ns2');
    deepStrictEqual(_data[2].value.value, 'http://example.com/ns2');
    deepStrictEqual(_data[3].name.value, 'attribute1');
    deepStrictEqual(_data[3].value.value, 'value1');
    deepStrictEqual(_data[4].name.value, 'attribute2');
    deepStrictEqual(_data[4].value.value, 'value2');
  });
});
