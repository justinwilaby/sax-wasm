(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
    typeof define === 'function' && define.amd ? define(['exports'], factory) :
    (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global["sax-wasm"] = {}));
})(this, (function (exports) { 'use strict';

    class SaxEventType {
        // 1
        static Text = 0b1;
        // 2
        static ProcessingInstruction = 0b10;
        // 4
        static SGMLDeclaration = 0b100;
        // 8
        static Doctype = 0b1000;
        // 16
        static Comment = 0b10000;
        // 32
        static OpenTagStart = 0b100000;
        // 64
        static Attribute = 0b1000000;
        // 128
        static OpenTag = 0b10000000;
        // 256
        static CloseTag = 0b100000000;
        // 512
        static Cdata = 0b1000000000;
    }
    class Reader {
        data;
        cache = {};
        ptr;
        constructor(data, ptr = 0) {
            this.data = data;
            this.ptr = ptr;
        }
    }
    class Position {
        line;
        character;
        constructor(line, character) {
            this.line = line;
            this.character = character;
        }
    }
    exports.AttributeType = void 0;
    (function (AttributeType) {
        AttributeType[AttributeType["Normal"] = 0] = "Normal";
        AttributeType[AttributeType["JSX"] = 1] = "JSX";
    })(exports.AttributeType || (exports.AttributeType = {}));
    class Attribute extends Reader {
        type;
        name;
        value;
        constructor(buffer, ptr = 0) {
            super(buffer, ptr);
            this.type = buffer[ptr];
            ptr += 1;
            const len = readU32(buffer, ptr);
            ptr += 4;
            this.name = new Text(buffer, ptr);
            ptr += len;
            this.value = new Text(buffer, ptr);
        }
        toJSON() {
            const { name, value, type } = this;
            return { name, value, type };
        }
        toString() {
            const { name, value } = this;
            return `${name}="${value}"`;
        }
    }
    class ProcInst extends Reader {
        target;
        content;
        constructor(buffer, ptr = 0) {
            super(buffer, ptr);
            ptr += 16;
            const len = readU32(buffer, ptr);
            ptr += 4;
            this.target = new Text(buffer, ptr);
            ptr += len;
            this.content = new Text(buffer, ptr);
        }
        get start() {
            return this.cache.start || (this.cache.start = readPosition(this.data, this.ptr));
        }
        get end() {
            return this.cache.end || (this.cache.end = readPosition(this.data, this.ptr + 8));
        }
        toJSON() {
            const { start, end, target, content } = this;
            return { start, end, target, content };
        }
        toString() {
            const { target, content } = this;
            return `<? ${target} ${content} ?>`;
        }
    }
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
            return (this.cache.value = readString(this.data, this.ptr + 20, valueLen));
        }
        toJSON() {
            const { start, end, value } = this;
            return { start, end, value };
        }
        toString() {
            return this.value;
        }
    }
    class Tag extends Reader {
        get openStart() {
            return this.cache.openStart || (this.cache.openStart = readPosition(this.data, this.ptr + 8));
        }
        get openEnd() {
            return this.cache.openEnd || (this.cache.openEnd = readPosition(this.data, this.ptr + 16));
        }
        get closeStart() {
            return this.cache.closeStart || (this.cache.closeStart = readPosition(this.data, this.ptr + 24));
        }
        get closeEnd() {
            return this.cache.closeEnd || (this.cache.closeEnd = readPosition(this.data, this.ptr + 32));
        }
        get selfClosing() {
            return !!this.data[this.ptr + 40];
        }
        get name() {
            if (this.cache.name) {
                return this.cache.name;
            }
            const nameLen = readU32(this.data, this.ptr + 41);
            return (this.cache.name = readString(this.data, this.ptr + 45, nameLen));
        }
        get attributes() {
            if (this.cache.attributes) {
                return this.cache.attributes;
            }
            // starting location of the attribute block
            let ptr = readU32(this.data, this.ptr);
            const numAttrs = readU32(this.data, ptr);
            ptr += 4;
            const attributes = [];
            for (let i = 0; i < numAttrs; i++) {
                const attrLen = readU32(this.data, ptr);
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
            let ptr = readU32(this.data, this.ptr + 4);
            const numTextNodes = readU32(this.data, ptr);
            const textNodes = [];
            ptr += 4;
            for (let i = 0; i < numTextNodes; i++) {
                const textLen = readU32(this.data, ptr);
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
        get value() {
            return this.name;
        }
    }
    class SAXParser {
        static textDecoder; // Web only
        events;
        wasmSaxParser;
        eventHandler;
        options;
        writeBuffer;
        constructor(events = 0, options = { highWaterMark: 32 * 1024 }) {
            this.options = options;
            const self = this;
            Object.defineProperties(this, {
                events: {
                    get: () => ~~events,
                    set: (value) => {
                        events = ~~value;
                        if (self.wasmSaxParser) {
                            self.wasmSaxParser.parser(events);
                        }
                    }, configurable: false, enumerable: true
                }
            });
        }
        write(chunk) {
            if (!this.wasmSaxParser) {
                return;
            }
            const { write, memory } = this.wasmSaxParser;
            // Allocations within the WASM process
            // invalidate reference to the memory buffer.
            // We check for this and create a new Uint8Array
            // with the new memory buffer reference if needed.
            // **NOTE** These allocations can slow down parsing
            // if they become excessive. Consider adjusting the
            // highWaterMark in the options up or down to find the optimal
            // memory allocation to prevent too many new Uint8Array instances.
            if (!this.writeBuffer || this.writeBuffer.buffer !== memory.buffer) {
                this.writeBuffer = new Uint8Array(memory.buffer);
            }
            this.writeBuffer.set(chunk, 0);
            write(0, chunk.byteLength);
        }
        end() {
            this.writeBuffer = undefined;
            this.wasmSaxParser?.end();
        }
        async prepareWasm(saxWasm) {
            const result = await WebAssembly.instantiate(saxWasm, {
                env: {
                    memoryBase: 0,
                    tableBase: 0,
                    memory: new WebAssembly.Memory({ initial: 10 }),
                    table: new WebAssembly.Table({ initial: 1, element: 'anyfunc' }),
                    event_listener: this.eventTrap
                }
            });
            if (result && typeof this.events === 'number') {
                const { parser } = this.wasmSaxParser = result.instance.exports;
                parser(this.events);
                return true;
            }
            throw new Error(`Failed to instantiate the parser.`);
        }
        eventTrap = (event, ptr, len) => {
            if (!this.wasmSaxParser) {
                return;
            }
            const uint8array = new Uint8Array(this.wasmSaxParser.memory.buffer, ptr, len).slice();
            let detail;
            switch (event) {
                case SaxEventType.Attribute:
                    detail = new Attribute(uint8array);
                    break;
                case SaxEventType.ProcessingInstruction:
                    detail = new ProcInst(uint8array);
                    break;
                case SaxEventType.OpenTag:
                case SaxEventType.CloseTag:
                case SaxEventType.OpenTagStart:
                    detail = new Tag(uint8array);
                    break;
                case SaxEventType.Text:
                case SaxEventType.Cdata:
                case SaxEventType.Comment:
                case SaxEventType.Doctype:
                case SaxEventType.SGMLDeclaration:
                    detail = new Text(uint8array);
                    break;
                default:
                    throw new Error('No reader for this event type');
            }
            if (this.eventHandler) {
                this.eventHandler(event, detail);
            }
        };
    }
    const readString = (data, offset, length) => {
        // Node
        if (globalThis.hasOwnProperty('Buffer')) {
            return Buffer.from(data.buffer, data.byteOffset + offset, length).toString();
        }
        // Web
        return (SAXParser.textDecoder || (SAXParser.textDecoder = new TextDecoder()))
            .decode(data.subarray(offset, offset + length));
    };
    const readU32 = (uint8Array, ptr) => (uint8Array[ptr + 3] << 24) | (uint8Array[ptr + 2] << 16) | (uint8Array[ptr + 1] << 8) | uint8Array[ptr];
    const readPosition = (uint8Array, ptr = 0) => {
        const line = readU32(uint8Array, ptr);
        const character = readU32(uint8Array, ptr + 4);
        return new Position(line, character);
    };

    exports.Attribute = Attribute;
    exports.Position = Position;
    exports.ProcInst = ProcInst;
    exports.Reader = Reader;
    exports.SAXParser = SAXParser;
    exports.SaxEventType = SaxEventType;
    exports.Tag = Tag;
    exports.Text = Text;

    Object.defineProperty(exports, '__esModule', { value: true });

}));
