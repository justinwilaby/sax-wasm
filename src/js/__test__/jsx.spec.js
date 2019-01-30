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

  it('should recognize child tags within Javascriopt', () => {
    parser.write(`
    <Component>
      {this.authenticated ? <User props={this.userProps}/> : <SignIn props={this.signInProps}/>}
    </Component>`);

    expect(_event).to.be(SaxEventType.CloseTag);
    expect(_data[0].name).to.be('User');
    expect(_data[1].name).to.be('SignIn');
    expect(_data[2].name).to.be('Component');
  });

  it('should recognize tags within javascript', () => {
    parser.write(`
    <ul>
      {(function (
        if (this.index > 1) {
          return (<li>{this.getLabel()}</li>)
        }
        return <li>{this.getDefault()}</li>
      ))()}
    </ul>
    `);

    expect(_event).to.be(SaxEventType.CloseTag);
    expect(_data[0].name).to.be('li');
    expect(_data[1].name).to.be('li');
    expect(_data[2].name).to.be('ul');
  });

  it('should recognize JSX Fragments', () => {
    parser.write('<> <div></div> <p></p> </>');
    expect(_data[0].name).to.be('div');
    expect(_data[1].name).to.be('p');
    expect(_data[2].name).to.be('');
  });

});
