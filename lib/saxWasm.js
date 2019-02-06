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
    constructor(uint8Array, ptr = 0) {
        this.read(uint8Array, ptr);
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
    read(uint8Array, ptr) {
        const namePtr = readU32(uint8Array, ptr);
        const nameLen = readU32(uint8Array, ptr + 4);
        this.name = readString(uint8Array.buffer, namePtr, nameLen);
        this.nameEnd = readPosition(uint8Array, ptr + 8);
        this.nameStart = readPosition(uint8Array, ptr + 16);
        const valuePtr = readU32(uint8Array, ptr + 24);
        const valueLen = readU32(uint8Array, ptr + 28);
        this.value = readString(uint8Array.buffer, valuePtr, valueLen);
        this.valueEnd = readPosition(uint8Array, ptr + 32);
        this.valueStart = readPosition(uint8Array, ptr + 40);
    }
}
Attribute.BYTES_IN_DESCRIPTOR = 48;
exports.Attribute = Attribute;
class Text extends Reader {
    read(uint8Array, ptr) {
        const valuePtr = readU32(uint8Array, ptr + 16);
        const valueLen = readU32(uint8Array, ptr + 20);
        this.end = readPosition(uint8Array, ptr);
        this.start = readPosition(uint8Array, ptr + 8);
        this.value = readString(uint8Array.buffer, valuePtr, valueLen);
    }
}
Text.BYTES_IN_DESCRIPTOR = 24;
exports.Text = Text;
class Tag extends Reader {
    read(uint8Array, ptr) {
        this.closeEnd = readPosition(uint8Array, ptr);
        this.closeStart = readPosition(uint8Array, ptr + 8);
        this.openEnd = readPosition(uint8Array, ptr + 16);
        this.openStart = readPosition(uint8Array, ptr + 24);
        const namePtr = readU32(uint8Array, ptr + 32);
        const nameLen = readU32(uint8Array, ptr + 36);
        this.name = readString(uint8Array.buffer, namePtr, nameLen);
        this.selfClosing = !!uint8Array[ptr + 40];
        let offset = ptr + 41;
        const attributes = [];
        let numAttrs = readU32(uint8Array, offset);
        offset += 4;
        for (let i = 0; i < numAttrs; i++) {
            attributes[i] = new Attribute(uint8Array, offset);
            offset += Attribute.BYTES_IN_DESCRIPTOR;
        }
        this.attributes = attributes;
        const textNodes = [];
        let numNodes = uint8Array[offset];
        offset += 4;
        for (let i = 0; i < numNodes; i++) {
            textNodes[i] = new Text(uint8Array, offset);
            offset += Text.BYTES_IN_DESCRIPTOR;
        }
        this.textNodes = textNodes;
    }
}
exports.Tag = Tag;
class SAXParser {
    constructor(events = 0, options = { highWaterMark: 64 * 1024 }) {
        this.eventTrap = (event, ptr, len) => {
            let payload;
            switch (event) {
                case SaxEventType.Attribute:
                    payload = new Attribute(this.readBuffer, ptr);
                    break;
                case SaxEventType.OpenTag:
                case SaxEventType.CloseTag:
                case SaxEventType.OpenTagStart:
                    payload = new Tag(this.readBuffer, ptr);
                    break;
                case SaxEventType.Text:
                    payload = new Text(this.readBuffer, ptr);
                    break;
                case SaxEventType.OpenCDATA:
                    payload = readPosition(this.readBuffer, ptr);
                    break;
                default:
                    payload = readString(this.readBuffer.buffer, ptr, len);
                    break;
            }
            this.eventHandler(event, payload);
        };
        this.options = options;
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
    write(slice, offset = 0) {
        const { write } = this.wasmSaxParser;
        if (!this.writeBuffer) {
            this.writeBuffer = new Uint8Array(this.wasmSaxParser.memory.buffer, 0, this.options.highWaterMark);
            this.readBuffer = new Uint8Array(this.wasmSaxParser.memory.buffer);
        }
        this.writeBuffer.set(slice);
        write(offset, slice.length);
    }
    end() {
        this.wasmSaxParser.end();
    }
    async prepareWasm(saxWasm) {
        const result = await WebAssembly.instantiate(saxWasm, {
            env: {
                memoryBase: 0,
                tableBase: 0,
                memory: new WebAssembly.Memory({ initial: 32 }),
                table: new WebAssembly.Table({ initial: 1, element: 'anyfunc' }),
                event_listener: this.eventTrap
            }
        });
        if (result) {
            const { parser } = this.wasmSaxParser = result.instance.exports;
            parser(this.events);
            return parser;
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
function readU32(uint8Array, ptr) {
    return (uint8Array[ptr + 3] << 24) | (uint8Array[ptr + 2] << 16) | (uint8Array[ptr + 1] << 8) | uint8Array[ptr];
}
function readPosition(uint8Array, ptr = 0) {
    const line = readU32(uint8Array, ptr);
    const character = readU32(uint8Array, ptr + 4);
    return new Position(line, character);
}
//# sourceMappingURL=saxWasm.js.map