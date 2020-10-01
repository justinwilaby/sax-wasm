import { Attribute, SaxEventType, SAXParser } from '../saxWasm'
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { deepStrictEqual } from 'assert';

const saxWasm = readFileSync(resolve(__dirname, '../../../lib/sax-wasm.wasm'));

describe('SaxWasm', () => {
    let parser: SAXParser;
    let _event: SaxEventType;
    let _data: Attribute[];

    before(async () => {
        parser = new SAXParser(SaxEventType.Comment | SaxEventType.Attribute | SaxEventType.OpenTag);

        parser.eventHandler = function (event: SaxEventType, data: Attribute) {
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

    it('should correctly recognize elements after reporting a comment', () => {
        parser.write(Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<plugin name="test 1 attr">

  <name name="test 2 attr">the plugin name</name>

  <!-- name="test 3 attr" some comment -->

  <keywords name="test 4 attr">some,key,words</keywords>

</plugin>`));
        const names = [
            'name',
            'plugin',
            'name',
            'name',
            'undefined',
            'name',
            'keywords'
        ];
        deepStrictEqual(_data.length, 7);
        _data.forEach((data, index) => deepStrictEqual('' + data.name, names[index]));
    });
});
