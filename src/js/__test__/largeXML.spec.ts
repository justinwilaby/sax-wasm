import { readFileSync, createReadStream } from 'fs';
import { resolve as pathResolve } from 'path';
import {deepEqual, equal, notStrictEqual, strictEqual} from 'assert';
import { Detail, Reader, SaxEventType, SAXParser } from '../saxWasm';
import { Readable } from 'stream';

const saxWasm = readFileSync(pathResolve(__dirname, '../../../lib/sax-wasm.wasm'));
const options = {highWaterMark: 32 * 1024};
describe('When parsing XML, the SaxWasm', () => {
  let parser: SAXParser;
  let _data;
  beforeAll(async () => {
    parser = new SAXParser(SaxEventType.CloseTag);
    _data = [];

    parser.eventHandler = function (event: SaxEventType, data:Reader<Detail>) {
      _data.push(data.toJSON());
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
        parser.write(chunk as Uint8Array);
      });
      readable.on('end', () => resolve(1));
    });
  });

  it('should process large XML files', async () => {
    await new Promise<void>(resolve => {
      const readable = createReadStream(pathResolve(__dirname + '/xml.xml'), options);
      let t = process.hrtime();
      readable.on('data', (chunk) => {
        parser.write(chunk as Uint8Array);
      });
      readable.on('end', () => {
        let [s, n] = process.hrtime(t);
        process.stdout.write(`XML parsed in ${(s * 1000) + n / 1000 / 1000} ms\n`);
        resolve();
      });
    });
    notStrictEqual(_data.length, 0);

    const tagAt0x00020000 = _data.find(entry => entry.name.endsWith("0x00020000"));
    strictEqual(tagAt0x00020000?.name, "issueAt0x00020000");

  });

  it ('events should be equivalent between the generator and event_handler', async () => {
    const readable = createReadStream(pathResolve(__dirname + '/xml.xml'), options);
    const webReadable = Readable.toWeb(readable);
    const eventsFromGenerator: [SaxEventType, Detail][] = [];
    for await (const [event, detail] of parser.parse(webReadable.getReader() as ReadableStreamDefaultReader<Uint8Array<ArrayBufferLike>>)) {
      eventsFromGenerator.push([event, detail.toJSON()]);
    }

    const eventsFromEventHandler: [SaxEventType, Detail][] = [];
    parser.eventHandler = function (event, detail) {
      eventsFromEventHandler.push([event, detail.toJSON()]);
    };
    await new Promise(resolve => {
      const readable = createReadStream(pathResolve(__dirname + '/xml.xml'), options);
      readable.on('data', (chunk) => {
        parser.write(chunk as Uint8Array);
      });
      readable.on('end', () => resolve(1));
    });
    deepEqual(eventsFromGenerator, eventsFromEventHandler);
  });
});
