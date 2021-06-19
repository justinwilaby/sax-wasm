import { SaxEventType, SAXParser, Tag } from '../saxWasm';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { deepStrictEqual } from "assert";

const saxWasm = readFileSync(resolve(__dirname, '../../../lib/sax-wasm.wasm'));
describe('SaxWasm', () => {
  let parser: SAXParser;
  let _event: number;
  let _data: Tag[];

  beforeEach(async () => {
    parser = new SAXParser();
    parser.events = SaxEventType.Attribute;

    _data = [];
    _event = 0;

    parser.eventHandler = function (event, data) {
      _event |= event as number;
      _data.push(data as Tag);
    };
    return parser.prepareWasm(saxWasm);
  });

  afterEach(() => {
    parser.end();
  });

  it('should preserve structural directives', () => {
    parser.write(Buffer.from(`<button *ngIf="something" (click)="changeHour(hourStep)"> </button>`));
    deepStrictEqual(JSON.parse(JSON.stringify(_data[0])), {
      "name": {
        "end": {
          "character": 13,
          "line": 0
        },
        "start": {
          "character": 8,
          "line": 0
        },
        "value": "*ngIf"
      },
      "type": 0,
      "value": {
        "end": {
          "character": 24,
          "line": 0
        },
        "start": {
          "character": 15,
          "line": 0
        },
        "value": "something"
      }
    });
  })

});
