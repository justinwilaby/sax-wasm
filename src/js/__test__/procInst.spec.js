const {Attribute, SaxEventType, SAXParser}  = require('../../../lib//saxWasm');
const fs = require('fs');
const path = require('path');
const expect = require('expect.js');

const saxWasm = fs.readFileSync(path.resolve(__dirname, '../../../lib/sax-wasm.wasm'));
describe('When parsing JSX, the SaxWasm', () => {
  let parser;
  let _event;
  let _data;

  before(async () => {
    parser = new SAXParser(SaxEventType.ProcessingInstruction);

    parser.eventHandler = function (event, data) {
      _event = event;
      _data = data;
    };
    return parser.prepareWasm(saxWasm);
  });

  beforeEach(() => {
    _data = '';
  });

  afterEach(() => {
    parser.end();
  });

  it('should recognize Processing Instructions', () => {
    parser.write('<?xml version="1.0" encoding="utf-8"?>');
    expect(_event).to.be(SaxEventType.ProcessingInstruction);
    expect(_data).to.be('version="1.0" encoding="utf-8"');
  });
});
