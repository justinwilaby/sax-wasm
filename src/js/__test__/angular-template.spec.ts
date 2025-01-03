import { SaxEventType, SAXParser, Tag } from "../saxWasm";
import { readFileSync } from "fs";
import { resolve } from "path";
import { deepStrictEqual } from "assert";

const saxWasm = readFileSync(resolve(__dirname, "../../../lib/sax-wasm.wasm"));
describe("SaxWasm", () => {
  let parser: SAXParser;
  let _event: number;
  let _data: Tag[];

  beforeEach(async () => {
    parser = new SAXParser();

    _data = [];
    _event = 0;

    parser.eventHandler = function (event, data) {
      _event |= event as number;
      _data.push(JSON.parse(JSON.stringify(data)) as Tag);
    };
    return parser.prepareWasm(saxWasm);
  });

  afterEach(() => {
    parser.end();
  });

  it("should preserve template directives", () => {
    const dataToMatch = JSON.parse(`[{"openStart":{"line":2,"character":6},"openEnd":{"line":2,"character":10},"closeStart":{"line":2,"character":33},"closeEnd":{"line":2,"character":38},"name":"h2","attributes":[],"textNodes":[{"start":{"line":2,"character":10},"end":{"line":2,"character":33},"value":"{{ title | uppercase }}"}],"selfClosing":false},{"openStart":{"line":4,"character":6},"openEnd":{"line":4,"character":36},"closeStart":{"line":4,"character":36},"closeEnd":{"line":4,"character":49},"name":"ng-content","attributes":[{"name":{"start":{"line":4,"character":18},"end":{"line":4,"character":24},"value":"select"},"value":{"start":{"line":4,"character":26},"end":{"line":4,"character":34},"value":"[header]"},"type":0}],"textNodes":[],"selfClosing":false},{"openStart":{"line":8,"character":6},"openEnd":{"line":8,"character":9},"closeStart":{"line":8,"character":38},"closeEnd":{"line":8,"character":42},"name":"p","attributes":[],"textNodes":[{"start":{"line":8,"character":9},"end":{"line":8,"character":38},"value":"You entered: {{ inputValue }}"}],"selfClosing":false},{"openStart":{"line":14,"character":12},"openEnd":{"line":14,"character":44},"closeStart":{"line":14,"character":50},"closeEnd":{"line":14,"character":59},"name":"button","attributes":[{"name":{"start":{"line":14,"character":20},"end":{"line":14,"character":27},"value":"(click)"},"value":{"start":{"line":14,"character":29},"end":{"line":14,"character":42},"value":"removeItem(i)"},"type":0}],"textNodes":[{"start":{"line":14,"character":44},"end":{"line":14,"character":50},"value":"Remove"}],"selfClosing":false},{"openStart":{"line":12,"character":10},"openEnd":{"line":12,"character":78},"closeStart":{"line":15,"character":10},"closeEnd":{"line":15,"character":15},"name":"li","attributes":[{"name":{"start":{"line":12,"character":14},"end":{"line":12,"character":20},"value":"*ngFor"},"value":{"start":{"line":12,"character":22},"end":{"line":12,"character":54},"value":"let item of items; let i = index"},"type":0},{"name":{"start":{"line":12,"character":56},"end":{"line":12,"character":73},"value":"[attr.data-index]"},"value":{"start":{"line":12,"character":75},"end":{"line":12,"character":76},"value":"i"},"type":0}],"textNodes":[{"start":{"line":12,"character":78},"end":{"line":14,"character":12},"value":"\\n            {{ item }}\\n            "},{"start":{"line":14,"character":59},"end":{"line":15,"character":10},"value":"\\n          "}],"selfClosing":false},{"openStart":{"line":11,"character":8},"openEnd":{"line":11,"character":12},"closeStart":{"line":16,"character":8},"closeEnd":{"line":16,"character":13},"name":"ul","attributes":[],"textNodes":[{"start":{"line":11,"character":12},"end":{"line":12,"character":10},"value":"\\n          "},{"start":{"line":15,"character":15},"end":{"line":16,"character":8},"value":"\\n        "}],"selfClosing":false},{"openStart":{"line":10,"character":6},"openEnd":{"line":10,"character":59},"closeStart":{"line":17,"character":6},"closeEnd":{"line":17,"character":21},"name":"ng-container","attributes":[{"name":{"start":{"line":10,"character":20},"end":{"line":10,"character":25},"value":"*ngIf"},"value":{"start":{"line":10,"character":27},"end":{"line":10,"character":57},"value":"items.length > 0; else noItems"},"type":0}],"textNodes":[{"start":{"line":10,"character":59},"end":{"line":11,"character":8},"value":"\\n        "},{"start":{"line":16,"character":13},"end":{"line":17,"character":6},"value":"\\n      "}],"selfClosing":false},{"openStart":{"line":20,"character":8},"openEnd":{"line":20,"character":11},"closeStart":{"line":20,"character":29},"closeEnd":{"line":20,"character":33},"name":"p","attributes":[],"textNodes":[{"start":{"line":20,"character":11},"end":{"line":20,"character":29},"value":"No items available"}],"selfClosing":false},{"openStart":{"line":19,"character":6},"openEnd":{"line":19,"character":28},"closeStart":{"line":21,"character":6},"closeEnd":{"line":21,"character":20},"name":"ng-template","attributes":[{"name":{"start":{"line":19,"character":19},"end":{"line":0,"character":0},"value":"#noItems"},"value":{"start":{"line":0,"character":0},"end":{"line":0,"character":0},"value":""},"type":0}],"textNodes":[{"start":{"line":19,"character":28},"end":{"line":20,"character":8},"value":"\\n        "},{"start":{"line":20,"character":33},"end":{"line":21,"character":6},"value":"\\n      "}],"selfClosing":false},{"openStart":{"line":24,"character":8},"openEnd":{"line":24,"character":36},"closeStart":{"line":24,"character":55},"closeEnd":{"line":24,"character":59},"name":"p","attributes":[{"name":{"start":{"line":24,"character":11},"end":{"line":24,"character":24},"value":"*ngSwitchCase"},"value":{"start":{"line":24,"character":26},"end":{"line":24,"character":34},"value":"'active'"},"type":0}],"textNodes":[{"start":{"line":24,"character":36},"end":{"line":24,"character":55},"value":"Component is active"}],"selfClosing":false},{"openStart":{"line":25,"character":8},"openEnd":{"line":25,"character":38},"closeStart":{"line":25,"character":59},"closeEnd":{"line":25,"character":63},"name":"p","attributes":[{"name":{"start":{"line":25,"character":11},"end":{"line":25,"character":24},"value":"*ngSwitchCase"},"value":{"start":{"line":25,"character":26},"end":{"line":25,"character":36},"value":"'inactive'"},"type":0}],"textNodes":[{"start":{"line":25,"character":38},"end":{"line":25,"character":59},"value":"Component is inactive"}],"selfClosing":false},{"openStart":{"line":26,"character":8},"openEnd":{"line":26,"character":28},"closeStart":{"line":26,"character":42},"closeEnd":{"line":26,"character":46},"name":"p","attributes":[{"name":{"start":{"line":26,"character":11},"end":{"line":0,"character":0},"value":"*ngSwitchDefault"},"value":{"start":{"line":0,"character":0},"end":{"line":0,"character":0},"value":""},"type":0}],"textNodes":[{"start":{"line":26,"character":28},"end":{"line":26,"character":42},"value":"Unknown status"}],"selfClosing":false},{"openStart":{"line":23,"character":6},"openEnd":{"line":23,"character":31},"closeStart":{"line":27,"character":6},"closeEnd":{"line":27,"character":12},"name":"div","attributes":[{"name":{"start":{"line":23,"character":11},"end":{"line":23,"character":21},"value":"[ngSwitch]"},"value":{"start":{"line":23,"character":23},"end":{"line":23,"character":29},"value":"status"},"type":0}],"textNodes":[{"start":{"line":23,"character":31},"end":{"line":24,"character":8},"value":"\\n        "},{"start":{"line":24,"character":59},"end":{"line":25,"character":8},"value":"\\n        "},{"start":{"line":25,"character":63},"end":{"line":26,"character":8},"value":"\\n        "},{"start":{"line":26,"character":46},"end":{"line":27,"character":6},"value":"\\n      "}],"selfClosing":false},{"openStart":{"line":29,"character":6},"openEnd":{"line":29,"character":42},"closeStart":{"line":29,"character":58},"closeEnd":{"line":29,"character":67},"name":"button","attributes":[{"name":{"start":{"line":29,"character":14},"end":{"line":29,"character":21},"value":"(click)"},"value":{"start":{"line":29,"character":23},"end":{"line":29,"character":40},"value":"toggleHighlight()"},"type":0}],"textNodes":[{"start":{"line":29,"character":42},"end":{"line":29,"character":58},"value":"Toggle Highlight"}],"selfClosing":false},{"openStart":{"line":31,"character":6},"openEnd":{"line":31,"character":18},"closeStart":{"line":31,"character":18},"closeEnd":{"line":31,"character":31},"name":"ng-content","attributes":[],"textNodes":[],"selfClosing":false},{"openStart":{"line":6,"character":6},"openEnd":{"line":6,"character":76},"closeStart":{"line":0,"character":0},"closeEnd":{"line":32,"character":10},"name":"input","attributes":[{"name":{"start":{"line":6,"character":13},"end":{"line":6,"character":24},"value":"#inputField"},"value":{"start":{"line":0,"character":0},"end":{"line":0,"character":0},"value":""},"type":0},{"name":{"start":{"line":6,"character":25},"end":{"line":6,"character":36},"value":"[(ngModel)]"},"value":{"start":{"line":6,"character":38},"end":{"line":6,"character":48},"value":"inputValue"},"type":0},{"name":{"start":{"line":6,"character":50},"end":{"line":6,"character":63},"value":"(keyup.enter)"},"value":{"start":{"line":6,"character":65},"end":{"line":6,"character":74},"value":"onEnter()"},"type":0}],"textNodes":[{"start":{"line":6,"character":76},"end":{"line":8,"character":6},"value":"\\n\\n      "},{"start":{"line":8,"character":42},"end":{"line":10,"character":6},"value":"\\n\\n      "},{"start":{"line":17,"character":21},"end":{"line":19,"character":6},"value":"\\n\\n      "},{"start":{"line":21,"character":20},"end":{"line":23,"character":6},"value":"\\n\\n      "},{"start":{"line":27,"character":12},"end":{"line":29,"character":6},"value":"\\n\\n      "},{"start":{"line":29,"character":67},"end":{"line":31,"character":6},"value":"\\n\\n      "},{"start":{"line":31,"character":31},"end":{"line":32,"character":4},"value":"\\n    "}],"selfClosing":false},{"openStart":{"line":1,"character":4},"openEnd":{"line":1,"character":70},"closeStart":{"line":32,"character":4},"closeEnd":{"line":32,"character":10},"name":"div","attributes":[{"name":{"start":{"line":1,"character":9},"end":{"line":1,"character":14},"value":"class"},"value":{"start":{"line":1,"character":16},"end":{"line":1,"character":25},"value":"container"},"type":0},{"name":{"start":{"line":1,"character":27},"end":{"line":1,"character":36},"value":"[ngClass]"},"value":{"start":{"line":1,"character":38},"end":{"line":1,"character":68},"value":"{'highlighted': isHighlighted}"},"type":0}],"textNodes":[{"start":{"line":1,"character":70},"end":{"line":2,"character":6},"value":"\\n      "},{"start":{"line":2,"character":38},"end":{"line":4,"character":6},"value":"\\n\\n      "},{"start":{"line":4,"character":49},"end":{"line":6,"character":6},"value":"\\n\\n      "}],"selfClosing":false}]`);

    parser.events = SaxEventType.CloseTag;
    parser.write(
      Buffer.from(`
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
  `)
    );
    deepStrictEqual(JSON.parse(JSON.stringify(_data)), dataToMatch);
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
        end: {
          character: 13,
          line: 0,
        },
        start: {
          character: 8,
          line: 0,
        },
        value: "*ngIf",
      },
      type: 0,
      value: {
        end: {
          character: 24,
          line: 0,
        },
        start: {
          character: 15,
          line: 0,
        },
        value: "something",
      },
    });
  });
});

