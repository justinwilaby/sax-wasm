"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class SaxEventType {
}
// 1
SaxEventType.Text = 0b1;
// 2
SaxEventType.ProcessingInstruction = 0b10;
// 4
SaxEventType.SGMLDeclaration = 0b100;
// 8
SaxEventType.Doctype = 0b1000;
// 16
SaxEventType.Comment = 0b10000;
// 32
SaxEventType.OpenTagStart = 0b100000;
// 64
SaxEventType.Attribute = 0b1000000;
// 128
SaxEventType.OpenTag = 0b10000000;
// 256
SaxEventType.CloseTag = 0b100000000;
// 512
SaxEventType.OpenCDATA = 0b1000000000;
// 1024
SaxEventType.Cdata = 0b10000000000;
// 2048
SaxEventType.CloseCDATA = 0b100000000000;
exports.SaxEventType = SaxEventType;
const jsonFlag = SaxEventType.Attribute |
    SaxEventType.OpenTagStart |
    SaxEventType.OpenTag |
    SaxEventType.CloseTag |
    SaxEventType.OpenCDATA |
    SaxEventType.CloseCDATA;
class SAXParser {
    constructor(events = 0) {
        this.eventTrap = (event, ptr, len) => {
            const { memory } = this.wasmSaxParser;
            const rawUtf8String = uint8ToUtf8(memory.buffer, ptr, len);
            const payload = event & jsonFlag ? JSON.parse(rawUtf8String) : rawUtf8String;
            this.eventHandler(event, payload);
        };
        const self = this;
        Object.defineProperties(this, {
            events: {
                get: function () {
                    return ~~events;
                },
                set: function (value) {
                    events = ~~value;
                    if (self.wasmSaxParser) {
                        self.wasmSaxParser.parser(events);
                    }
                }, configurable: false, enumerable: true
            }
        });
    }
    write(value) {
        const { memory, write } = this.wasmSaxParser;
        const slice = stringToUtf8Buffer(value);
        const memBuff = new Uint8Array(memory.buffer, 0, slice.length);
        memBuff.set(slice);
        write(0, memBuff.length);
    }
    async prepareWasm(saxWasm) {
        const result = await WebAssembly.instantiate(saxWasm, {
            env: {
                memoryBase: 0,
                tableBase: 0,
                memory: new WebAssembly.Memory({ initial: 256 }),
                table: new WebAssembly.Table({ initial: 4, element: 'anyfunc' }),
                event_listener: this.eventTrap
            }
        });
        if (result) {
            const { parser } = this.wasmSaxParser = result.instance.exports;
            parser(this.events);
            return true;
        }
        return false;
    }
}
exports.SAXParser = SAXParser;
function stringToUtf8Buffer(value) {
    const env = (global || window);
    // Node
    if ('Buffer' in env) {
        return Buffer.from(value);
    }
    // Web
    return new TextEncoder().encode(value);
}
function uint8ToUtf8(buffer, ptr, length) {
    const env = (global || window);
    // Node
    if ('Buffer' in env) {
        return Buffer.from(buffer, ptr, length).toString();
    }
    // Web
    return (SAXParser.textDecoder || (SAXParser.textDecoder = new TextDecoder()))
        .decode(new Uint8Array(buffer, ptr, length));
}
