const { SaxEventType, SAXParser } = require('../../../lib/');
const fs = require('fs');
const path = require('path');
const expect = require('expect.js');

const saxWasm = fs.readFileSync(path.resolve(__dirname, '../../../lib/sax-wasm.wasm'));
describe('When parsing XML, the SaxWasm', () => {
  let parser;
  let _event;
  let _data;
  before(async () => {
    parser = new SAXParser(SaxEventType.Cdata | SaxEventType.OpenCDATA);
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

  it('should report CDATA correctly', () => {
    parser.write(Buffer.from('<div><![CDATA[ did you know "x < y" & "z > y"? so I guess that means that z > x ]]></div>'));
    expect(_data[ 0 ]).to.eql({ line: 0, character: 7 });
    expect(_data[ 1 ]).to.be(' did you know "x < y" & "z > y"? so I guess that means that z > x ');
  });
});
