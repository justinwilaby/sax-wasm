const {Attribute, SaxEventType, SAXParser}  = require('../../../lib//saxWasm');
const fs = require('fs');
const path = require('path');

const saxWasm = fs.readFileSync(path.resolve(__dirname, '../../../lib/sax-wasm.wasm'));
describe('When parsing JSX, the SaxWasm', () => {
  let parser;
  let _event;
  let _data;
  beforeEach(async () => {
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
  });

  afterEach(() => {
    parser.end();
  });

  it('should recognize child tags within Javascriopt', () => {
    parser.write(`
    <Component>
      {this.authenticated ? <User props={this.userProps}/> : <SignIn props={this.signInProps}/>}
    </Component>`);

    expect(_event).toBe(SaxEventType.CloseTag);
    expect(_data[0].name).toBe('User');
    expect(_data[1].name).toBe('SignIn');
    expect(_data[2].name).toBe('Component');
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

    expect(_event).toBe(SaxEventType.CloseTag);
    expect(_data[0].name).toBe('li');
    expect(_data[1].name).toBe('li');
    expect(_data[2].name).toBe('ul');
  });

  it('should recognize JSX Fragments', () => {
    parser.write('<> <div></div> <p></p> </>');
    expect(_data[0].name).toBe('div');
    expect(_data[1].name).toBe('p');
    expect(_data[2].name).toBe('');
  });

});
