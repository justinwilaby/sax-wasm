import { AttributeType, SaxEventType, SAXParser } from '../saxWasm';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {deepStrictEqual} from 'assert';
import { Tag } from '../saxWasm';

const saxWasm = readFileSync(resolve(__dirname, '../../../lib/sax-wasm.wasm'));
describe('When parsing JSX, the SaxWasm', () => {
  let parser: SAXParser;
  let _event: SaxEventType | undefined;
  let _data: Tag[];

  beforeAll(async () => {
    parser = new SAXParser(SaxEventType.CloseTag);
    _data = [];

    parser.eventHandler = function (event, data) {
      _event = event;
      _data.push(data as Tag);
    };
    return parser.prepareWasm(saxWasm);
  });

  beforeEach(() => {
    _data = [];
  });

  afterEach(() => {
    parser.end();
  });

  it('should recognize child tags within javascript', () => {
    parser.write(Buffer.from(`
    <Component>
      {this.authenticated ? <User props={this.userProps}/> : <SignIn props={this.signInProps}/>}
    </Component>`));

    deepStrictEqual(_event,SaxEventType.CloseTag);
    deepStrictEqual(_data[0].name,'SignIn');
    deepStrictEqual(_data[1].name,'User');
    deepStrictEqual(_data[2].name,'Component');
  });

  it('should recognize tags within javascript', () => {
    parser.write(Buffer.from(`
    <ul>
      {(function (
        if (this.index > 1) {
          return (<li>{this.getLabel()}</li>)
        }
        return <li>{this.getDefault()}</li>
      ))()}
    </ul>
    `));

    deepStrictEqual(_event,SaxEventType.CloseTag);
    deepStrictEqual(_data[0].name,'li');
    deepStrictEqual(_data[1].name,'li');
    deepStrictEqual(_data[2].name,'ul');
  });

  it('should recognize JSX Fragments', () => {
    parser.write(Buffer.from('<> <div></div> <p></p> </>'));
    deepStrictEqual(_data[0].name,'div');
    deepStrictEqual(_data[1].name,'p');
    deepStrictEqual(_data[2].name,'');
  });

  it('should recognize JSXAttributeExpressions', () => {
    parser.write(Buffer.from(`
    <Component>
      {this.authenticated ? <User props={this.userProps}/> : <SignIn props={this.signInProps}/>}
    </Component>`));

    deepStrictEqual(_data[0].attributes[0].type,AttributeType.JSX);
    deepStrictEqual(_data[1].attributes[0].type,AttributeType.JSX);
  });

  it('should correctly parse simple JSX expressions', () => {
    parser.write(Buffer.from('<foo>{bar < baz ? <div></div> : <></>}</foo>'));
    deepStrictEqual(_data[0].name,'div');
    deepStrictEqual(_data[1].name,'');
    deepStrictEqual(_data[2].name,'foo');

    deepStrictEqual(_data[2].textNodes.length, 4);

    deepStrictEqual(_data[2].textNodes[0].value, '{bar ');
    deepStrictEqual(_data[2].textNodes[1].value, '< baz ? ');
    deepStrictEqual(_data[2].textNodes[2].value, ' : ');
    deepStrictEqual(_data[2].textNodes[3].value, '}');
  })
});
