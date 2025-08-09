import { Detail, Reader, SaxEventType, SAXParser, Tag } from "../saxWasm";
import { readFileSync } from "fs";
import { resolve } from "path";
import { deepStrictEqual, equal } from "assert";

const saxWasm = readFileSync(resolve(__dirname, "../../../lib/sax-wasm.wasm"));
describe("SaxWasm", () => {
  let parser: SAXParser;
  let _event: number;
  let _data: Tag[];

  beforeEach(async () => {
    parser = new SAXParser();

    _data = [];
    _event = 0;

    parser.eventHandler = function (event: SaxEventType, data:Reader<Detail>) {
      _event |= event as number;
      _data.push(data.toJSON() as Tag);
    };
    return parser.prepareWasm(saxWasm);
  });

  afterEach(() => {
    parser.end();
  });

  it("start and end line/chars should match value when substring is used", () => {
    parser.events = SaxEventType.CloseTag;
    const t = `
    <div class="container" [ngClass]="{'highlighted': isHighlighted}">
      <h2>{{ title | uppercase }}</h2>

      <ng-content select="[header]"></ng-content>

      <input #inputField [(ngModel)]="inputValue" (keyup.enter)="onEnter()">

      <p>You entered: {{ inputValue }}</p>

      <ng-container *ngIf="items.length > 0; else noItems">
        <ul>
          <li *ngFor="let item of items; let i = index" [attr.data-index]="i">
            {{ item }}
            <button (click)="removeItem(i)">Remove</button>
          </li>
        </ul>
      </ng-container>

      <ng-template #noItems>
        <p>No items available</p>
      </ng-template>

      <div [ngSwitch]="status">
        <p *ngSwitchCase="'active'">Component is active</p>
        <p *ngSwitchCase="'inactive'">Component is inactive</p>
        <p *ngSwitchDefault>Unknown status</p>
      </div>

      <button (click)="toggleHighlight()">Toggle Highlight</button>

      <ng-content></ng-content>
    </div>
  `;
    parser.write(Buffer.from(t));
    for (const tag of _data) {
        const {attributes, textNodes, openStart, openEnd} = tag;
        if (!attributes.length) {
            let line = t.split('\n')[openStart.line];
            equal(line.substring(openStart.character, openEnd.character), `<${tag.name}>`, 'Tag name was not found using `substring` matching');
        }
        for (const attr of attributes) {
            const {name, value} = attr;
            let line = t.split('\n')[name.start.line];
            equal(line.substring(name.start.character, name.end.character), name.value, 'Attribute name was not found using `substring` matching');
            equal(line.substring(value.start.character, value.end.character), value.value, 'Attribute name was not found using `substring` matching');
        }

        for (const text of textNodes) {
            const {start, end, value} = text;
            let line = t.split('\n')[start.line];
            equal(line.substring(start.character, end.character), value, 'Text value was not found using `substring` matching');
        }
    }
  });

  it("should preserve structural directives", () => {
    parser.events = SaxEventType.Attribute;
    parser.write(
      Buffer.from(
        `<button *ngIf="something" (click)="changeHour(hourStep)"> </button>`
      )
    );
    deepStrictEqual(JSON.parse(JSON.stringify(_data[0])), {
      name: {
        start: {
          line: 0,
          character: 8,
        },
        end: {
          line: 0,
          character: 13,
        },
        value: "*ngIf",
        byteOffsets: {
          start: 0,
          end: 13,
        },
      },
      value: {
        start: {
          line: 0,
          character: 15,
        },
        end: {
          line: 0,
          character: 24,
        },
        value: "something",
        byteOffsets: {
          start: 15,
          end: 25,
        },
      },
      type: 8,
      byteOffsets: {
        start: 8,
        end: 25,
      },
    });
  });
});

