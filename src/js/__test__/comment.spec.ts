import { Attribute, SaxEventType, SAXParser } from '../saxWasm'
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { deepStrictEqual, strictEqual } from 'assert';

const saxWasm = readFileSync(resolve(__dirname, '../../../lib/sax-wasm.wasm'));

describe('SaxWasm', () => {
    let parser: SAXParser;
    let _event: SaxEventType;
    let _data: Attribute[];

    beforeAll(async () => {
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

  <!--name="test 3 attr" some comment-->

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

    it('should contain the complete comment', () => {
      parser.write(Buffer.from(`<!--name="test 3 attr" some comment--> <!-- name="test 3 attr" some comment -->`));
      strictEqual(_data[0].value, 'name="test 3 attr" some comment');
      strictEqual(_data[1].value, ' name="test 3 attr" some comment ');
    });

    it ('should allow for chars that look like comment endings but are not really an endings', () => {
      parser.write(Buffer.from(`<!--name="test 3 attr" some comment -- > not an ending-->`));
      strictEqual(_data[0].value, 'name="test 3 attr" some comment -- > not an ending');
    });
});
