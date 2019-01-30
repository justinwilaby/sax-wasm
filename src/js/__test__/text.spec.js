const {SaxEventType, SAXParser}  = require('../../../lib/');
const fs = require('fs');
const path = require('path');
const expect = require('expect.js');

const saxWasm = fs.readFileSync(path.resolve(__dirname, '../../../lib/sax-wasm.wasm'));

describe('SaxWasm', () => {
  let parser;
  let _event;
  let _data;

  beforeEach(async () => {
    parser = new SAXParser();
    parser.events = SaxEventType.Text;

    _data = [];
    _event = 0;

    parser.eventHandler = function (event, data) {
      _event = event;
      _data.push(data);
    };
    return parser.prepareWasm(saxWasm);
  });

  afterEach(() => {
    parser.end();
  });

  it('should report text that occurs outside of an element', () => {
    parser.write('this is just plain text <br>');
    expect(_data[0].value).to.be('this is just plain text ');
  });

  it('should report multiple text blocks when child nodes exist between them', () => {
    parser.write('<div>I like to use <bold>bold text</bold> to emphasize</div>');

    expect(_data.length).to.be(3);
    expect(_data[0].value).to.be('I like to use ');
    expect(_data[1].value).to.be('bold text');
    expect(_data[2].value).to.be(' to emphasize');
  });

  it('should capture conrtol chars properly', () => {
    const str = `<div>


</div>`;
  parser.write(str);

  expect(_data[0].value).to.be('\n\n\n');
  });
});
