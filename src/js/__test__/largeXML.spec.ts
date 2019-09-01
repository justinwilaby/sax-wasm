import { SaxEventType, SAXParser } from '../../../lib/';
import { readFileSync, createReadStream } from 'fs';
import { resolve as pathResolve } from 'path';
import {notStrictEqual} from 'assert';

const saxWasm = readFileSync(pathResolve(__dirname, '../../../lib/sax-wasm.wasm'));
// fs.writeFileSync(path.resolve(__dirname, '../../../lib/sax-wasm.base64'), saxWasm.toString('base64'));
const options = {highWaterMark: 64 * 1024};
describe('When parsing XML, the SaxWasm', () => {
  let parser;
  let _event;
  let _data;
  before(async () => {
    parser = new SAXParser(SaxEventType.CloseTag, options);
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

  it('should read', async () => {
    await new Promise(resolve => {
      const readable = createReadStream(pathResolve(__dirname + '/xml.xml'), options);
      readable.on('data', (chunk) => {
        parser.write(chunk);
      });
      readable.on('end', resolve);
    });
  });

  it('should process large XML files', async () => {
    await new Promise(resolve => {
      const readable = createReadStream(pathResolve(__dirname + '/xml.xml'), options);
      let t = Date.now();
      readable.on('data', (chunk) => {
        parser.write(chunk);
      });
      readable.on('end', () => {
        t = Date.now() - t;
        console.log(t);
        resolve()
      });
    });
    notStrictEqual(_data.length, 0);
  });
});
