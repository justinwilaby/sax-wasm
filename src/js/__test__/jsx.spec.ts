import {Attribute, SaxEventType, SAXParser} from '../index';
import * as fs from 'fs';
import * as path from 'path';

const saxWasm = fs.readFileSync(path.resolve(__dirname, '../../../lib/sax-wasm.wasm'));
describe('When parsing JSX, the SaxWasm', () => {
  let parser: SAXParser;
  let _event: number;
  let _data: Attribute[];
  beforeEach(async () => {
    parser = new SAXParser(SaxEventType.CloseTag);
    _data = [] as Attribute[];
    _event = 0;

    parser.eventHandler = function (event: SaxEventType, data: Attribute) {
      _event = event as number;
      _data.push(data);
    };
    return parser.prepareWasm(saxWasm);
  });

  it('should recognize child tags within Javascriopt', () => {
    parser.write(`
<Component>
  {this.authenticated ? <User props={this.userProps}/> : <SignIn props={this.signInProps}/>
</Component>`);

    expect(_event).toBe(SaxEventType.CloseTag);
    expect(_data[0].name).toBe('User');
    expect(_data[1].name).toBe('SignIn');
    expect(_data[2].name).toBe('Component');
  });
});
