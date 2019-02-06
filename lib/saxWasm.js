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
class Reader {
    constructor(buf, ptr = 0) {
        this.read(buf, ptr);
    }
}
class Position {
    constructor(line, character) {
        this.line = line;
        this.character = character;
    }
}
exports.Position = Position;
class Attribute extends Reader {
    read(buf, ptr) {
        const namePtr = buf[ptr];
        const nameLen = buf[ptr + 1];
        this.name = readString(buf.buffer, namePtr, nameLen);
        this.nameEnd = new Position(buf[ptr + 2], buf[ptr + 3]);
        this.nameStart = new Position(buf[ptr + 4], buf[ptr + 5]);
        const valuePtr = buf[ptr + 6];
        const valueLen = buf[ptr + 7];
        this.value = readString(buf.buffer, valuePtr, valueLen);
        this.valueEnd = new Position(buf[ptr + 8], buf[ptr + 9]);
        this.valueStart = new Position(buf[ptr + 10], buf[ptr + 11]);
    }
}
Attribute.BYTES_IN_DESCRIPTOR = 12;
exports.Attribute = Attribute;
class Text extends Reader {
    read(buf, ptr) {
        const valuePtr = buf[ptr + 4];
        const valueLen = buf[ptr + 5];
        this.end = new Position(buf[ptr], buf[ptr + 1]);
        this.start = new Position(buf[ptr + 2], buf[ptr + 3]);
        this.value = readString(buf.buffer, valuePtr, valueLen);
    }
}
Text.BYTES_IN_DESCRIPTOR = 6;
exports.Text = Text;
class Tag extends Reader {
    read(buf) {
        this.closeEnd = new Position(buf[0], buf[1]);
        this.closeStart = new Position(buf[2], buf[3]);
        this.openEnd = new Position(buf[4], buf[5]);
        this.openStart = new Position(buf[6], buf[7]);
        const namePtr = buf[8];
        const nameLen = buf[9];
        this.name = readString(buf.buffer, namePtr, nameLen);
        this.selfClosing = !!buf[10];
        let offset = 11;
        const attributes = [];
        let numAttrs = buf[offset];
        offset++;
        for (let i = 0; i < numAttrs; i++) {
            attributes[i] = new Attribute(buf, offset);
            offset += Attribute.BYTES_IN_DESCRIPTOR;
        }
        this.attributes = attributes;
        const textNodes = [];
        let numNodes = buf[offset];
        offset++;
        for (let i = 0; i < numNodes; i++) {
            textNodes[i] = new Text(buf, offset);
            offset += Text.BYTES_IN_DESCRIPTOR;
        }
        this.textNodes = textNodes;
    }
}
exports.Tag = Tag;
class SAXParser {
    constructor(events = 0) {
        this.eventTrap = (event, ptr, len) => {
            const buffer = this.wasmSaxParser.memory.buffer;
            let payload;
            switch (event) {
                case SaxEventType.Attribute:
                    payload = new Attribute(new Uint32Array(buffer, ptr));
                    break;
                case SaxEventType.OpenTag:
                case SaxEventType.CloseTag:
                case SaxEventType.OpenTagStart:
                    payload = new Tag(new Uint32Array(buffer, ptr));
                    break;
                case SaxEventType.Text:
                    payload = new Text(new Uint32Array(buffer, ptr));
                    break;
                case SaxEventType.OpenCDATA:
                    const b = new Uint32Array(buffer, ptr, 2);
                    payload = new Position(b[0], b[1]);
                    break;
                default:
                    payload = readString(buffer, ptr, len);
                    break;
            }
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
    end() {
        this.wasmSaxParser.end();
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
    }
}
exports.SAXParser = SAXParser;
function stringToUtf8Buffer(value) {
    const env = (global || window);
    // Node
    if (env.Buffer !== undefined) {
        return Buffer.from(value);
    }
    // Web
    return (SAXParser.textEncoder || (SAXParser.textEncoder = new TextEncoder())).encode(value);
}
function readString(data, byteOffset, length) {
    const env = (global || window);
    // Node
    if (env.Buffer !== undefined) {
        return Buffer.from(data, byteOffset, length).toString();
    }
    // Web
    return (SAXParser.textDecoder || (SAXParser.textDecoder = new TextDecoder()))
        .decode(new Uint8Array(data, byteOffset, length));
}
//# sourceMappingURL=saxWasm.js.map