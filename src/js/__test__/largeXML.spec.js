const {SaxEventType, SAXParser}  = require('../../../lib/');
const fs = require('fs');
const path = require('path');
const expect = require('expect.js');

const saxWasm = fs.readFileSync(path.resolve(__dirname, '../../../lib/sax-wasm.wasm'));
describe('When parsing JSX, the SaxWasm', () => {
  let parser;
  let _event;
  let _data;
  before(async () => {
    parser = new SAXParser(SaxEventType.CloseTag);
    _data = [];
    _event = 0;

    parser.eventHandler = function (event, data) {
      _event = event;
      _data.push(data);
    };
    return parser.prepareWasm(saxWasm);
  });

  beforeEach(() => {
    _data = [];
  })

  afterEach(() => {
    parser.end();
  });

  it('should process large XML files', () => {
    const document = fs.readFileSync(path.resolve(__dirname + '/xml.xml'), {encoding:'utf8'});
    parser.write(document);
    expect(_data.length).not.to.be(0);
    // const len = document.length;
    // const chunkSize = 10000;
    // let idx = 0;
    // while (idx < len) {
    //   parser.write(document.substr(idx, chunkSize));
    //   idx += chunkSize;
    // }
  });
});
