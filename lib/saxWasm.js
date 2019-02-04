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
    constructor(buf, ptr) {
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
        const namePtr = readU32(buf, ptr);
        const nameLen = readU32(buf, ptr + 4);
        const valuePtr = readU32(buf, ptr + 24);
        const valueLen = readU32(buf, ptr + 28);
        this.nameEnd = readPosition(buf, ptr + 8);
        this.nameStart = readPosition(buf, ptr + 16); // 8 bytes
        this.valueEnd = readPosition(buf, ptr + 32); // 8 bytes
        this.valueStart = readPosition(buf, ptr + 40); // 8 bytes
        this.name = readString(buf.buffer, namePtr, nameLen);
        this.value = readString(buf.buffer, valuePtr, valueLen);
    }
}
Attribute.BYTES_IN_DESCRIPTOR = 48;
exports.Attribute = Attribute;
class Text extends Reader {
    read(buf, ptr) {
        const valuePtr = readU32(buf, ptr + 16);
        const valueLen = readU32(buf, ptr + 20);
        this.end = readPosition(buf, ptr);
        this.start = readPosition(buf, ptr + 8);
        this.value = readString(buf.buffer, valuePtr, valueLen);
    }
}
Text.BYTES_IN_DESCRIPTOR = 24;
exports.Text = Text;
class Tag extends Reader {
    read(buf, ptr) {
        this.closeEnd = readPosition(buf, ptr);
        this.closeStart = readPosition(buf, ptr + 8);
        this.openEnd = readPosition(buf, ptr + 16);
        this.openStart = readPosition(buf, ptr + 24);
        const namePtr = readU32(buf, ptr + 32);
        const nameLen = readU32(buf, ptr + 36);
        this.name = readString(buf.buffer, namePtr, nameLen);
        this.selfClosing = !!buf[ptr + 40];
        let offset = ptr + 41;
        const attributes = [];
        let numAttrs = readU32(buf, offset);
        offset += 4;
        for (let i = 0; i < numAttrs; i++) {
            attributes[i] = new Attribute(buf, offset);
            offset += Attribute.BYTES_IN_DESCRIPTOR;
        }
        this.attributes = attributes;
        const textNodes = [];
        let numNodes = readU32(buf, offset);
        offset += 4;
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
                    payload = new Attribute(new Uint8Array(buffer), ptr);
                    break;
                case SaxEventType.OpenTag:
                case SaxEventType.CloseTag:
                case SaxEventType.OpenTagStart:
                    payload = new Tag(new Uint8Array(buffer), ptr);
                    break;
                case SaxEventType.Text:
                    payload = new Text(new Uint8Array(buffer), ptr);
                    break;
                case SaxEventType.OpenCDATA:
                    payload = readPosition(new Uint8Array(buffer), ptr);
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
    return (SAXParser.textEncoder || (SAXParser.textEncoder = new TextEncoder())).encode(value);
}
function readPosition(data, ptr = 0) {
    const line = readU32(data, ptr);
    const character = readU32(data, ptr + 4);
    return new Position(line, character);
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
function readU32(buffer, ptr) {
    return buffer[ptr + 3] << 24 | buffer[ptr + 2] << 16 | buffer[ptr + 1] << 8 | buffer[ptr];
}
//# sourceMappingURL=saxWasm.js.map