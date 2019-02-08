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
    constructor(data, ptr = 0) {
        this.cache = {};
        this.data = data;
        this.ptr = ptr;
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
    get nameStart() {
        return this.cache.nameStart || (this.cache.nameStart = readPosition(this.data, this.ptr));
    }
    get nameEnd() {
        return this.cache.nameEnd || (this.cache.nameEnd = readPosition(this.data, this.ptr + 8));
    }
    get valueStart() {
        return this.cache.valueStart || (this.cache.valueStart = readPosition(this.data, this.ptr + 16));
    }
    get valueEnd() {
        return this.cache.valueEnd || (this.cache.valueEnd = readPosition(this.data, this.ptr + 24));
    }
    get name() {
        if (this.cache.name) {
            return this.cache.name;
        }
        const nameLen = readU32(this.data, this.ptr + 32);
        return (this.cache.name = readString(this.data.buffer, this.ptr + 36, nameLen));
    }
    get value() {
        if (this.cache.value) {
            return this.cache.value;
        }
        const nameLen = readU32(this.data, this.ptr + 32);
        const valueLen = readU32(this.data, this.ptr + 36 + nameLen);
        return (this.cache.value = readString(this.data.buffer, this.ptr + 40 + nameLen, valueLen));
    }
    toJSON() {
        const { nameStart, nameEnd, valueStart, valueEnd, name, value } = this;
        return { nameStart, nameEnd, valueStart, valueEnd, name, value };
    }
}
exports.Attribute = Attribute;
class Text extends Reader {
    get start() {
        return this.cache.start || (this.cache.start = readPosition(this.data, this.ptr));
    }
    get end() {
        return this.cache.end || (this.cache.end = readPosition(this.data, this.ptr + 8));
    }
    get value() {
        if (this.cache.value) {
            return this.cache.value;
        }
        const valueLen = readU32(this.data, this.ptr + 16);
        return (this.cache.value = readString(this.data.buffer, this.ptr + 20, valueLen));
    }
    toJSON() {
        const { start, end, value } = this;
        return { start, end, value };
    }
}
exports.Text = Text;
class Tag extends Reader {
    get openStart() {
        return this.cache.openStart || (this.cache.openStart = readPosition(this.data, 0));
    }
    get openEnd() {
        return this.cache.openEnd || (this.cache.openEnd = readPosition(this.data, 8));
    }
    get closeStart() {
        return this.cache.closeStart || (this.cache.closeStart = readPosition(this.data, 16));
    }
    get closeEnd() {
        return this.cache.closeEnd || (this.cache.closeEnd = readPosition(this.data, 24));
    }
    get selfClosing() {
        return !!this.data[32];
    }
    get name() {
        if (this.cache.name) {
            return this.cache.name;
        }
        const nameLen = readU32(this.data, 33);
        return (this.cache.name = readString(this.data.buffer, 37, nameLen));
    }
    get attributes() {
        if (this.cache.attributes) {
            return this.cache.attributes;
        }
        // starting location of the attribute block
        let ptr = readU32(this.data, this.data.length - 8);
        let numAttrs = readU32(this.data, ptr);
        ptr += 4;
        const attributes = [];
        for (let i = 0; i < numAttrs; i++) {
            let attrLen = readU32(this.data, ptr);
            ptr += 4;
            attributes[i] = new Attribute(this.data, ptr);
            ptr += attrLen;
        }
        return (this.cache.attributes = attributes);
    }
    get textNodes() {
        if (this.cache.textNodes) {
            return this.cache.textNodes;
        }
        // starting location of the text nodes block
        let ptr = readU32(this.data, this.data.length - 4);
        let numTextNodes = readU32(this.data, ptr);
        const textNodes = [];
        ptr += 4;
        for (let i = 0; i < numTextNodes; i++) {
            let textLen = readU32(this.data, ptr);
            ptr += 4;
            textNodes[i] = new Text(this.data, ptr);
            ptr += textLen;
        }
        return (this.cache.textNodes = textNodes);
    }
    toJSON() {
        const { openStart, openEnd, closeStart, closeEnd, name, attributes, textNodes, selfClosing } = this;
        return { openStart, openEnd, closeStart, closeEnd, name, attributes, textNodes, selfClosing };
    }
}
exports.Tag = Tag;
class SAXParser {
    constructor(events = 0, options = { highWaterMark: 64 * 1024 }) {
        this.eventTrap = (event, ptr, len) => {
            const uint8array = new Uint8Array(this.wasmSaxParser.memory.buffer.slice(ptr, ptr + len));
            let payload;
            switch (event) {
                case SaxEventType.Attribute:
                    payload = new Attribute(uint8array);
                    break;
                case SaxEventType.OpenTag:
                case SaxEventType.CloseTag:
                case SaxEventType.OpenTagStart:
                    payload = new Tag(uint8array);
                    break;
                case SaxEventType.Text:
                    payload = new Text(uint8array);
                    break;
                case SaxEventType.OpenCDATA:
                    payload = readPosition(uint8array);
                    break;
                default:
                    payload = readString(this.wasmSaxParser.memory.buffer, ptr, len);
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
    write(chunk, offset = 0) {
        const { write } = this.wasmSaxParser;
        if (!this.writeBuffer) {
            this.writeBuffer = new Uint8Array(this.wasmSaxParser.memory.buffer, 0, this.options.highWaterMark);
        }
        this.writeBuffer.set(chunk);
        write(offset, chunk.byteLength);
    }
    end() {
        this.writeBuffer = null;
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
            return true;
        }
        throw new Error(`Failed to instantiate the parser.`);
    }
}
exports.SAXParser = SAXParser;
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