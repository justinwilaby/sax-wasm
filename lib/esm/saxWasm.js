/**
 * An enum representing the events that can be
 * subscribed to on the parser. Multiple events
 * are subscribed to by using the bitwise or operator.
 *
 * @example
 * ```ts
 *  // Subscribe to both the Text and OpenTag events.
 *  const parser = new SaxParser(SaxEventType.Text | SaxEventType.OpenTag);
 * ```
 * Event subscriptions can be updated between write operations.
 *
 * Note that minimizing the numnber of events will have a
 * slight performance improvement which becomes more noticable
 * on very large documents.
 */
export var SaxEventType;
(function (SaxEventType) {
    // 1
    SaxEventType[SaxEventType["Text"] = 1] = "Text";
    // 2
    SaxEventType[SaxEventType["ProcessingInstruction"] = 2] = "ProcessingInstruction";
    // 4
    SaxEventType[SaxEventType["SGMLDeclaration"] = 4] = "SGMLDeclaration";
    // 8
    SaxEventType[SaxEventType["Doctype"] = 8] = "Doctype";
    // 16
    SaxEventType[SaxEventType["Comment"] = 16] = "Comment";
    // 32
    SaxEventType[SaxEventType["OpenTagStart"] = 32] = "OpenTagStart";
    // 64
    SaxEventType[SaxEventType["Attribute"] = 64] = "Attribute";
    // 128
    SaxEventType[SaxEventType["OpenTag"] = 128] = "OpenTag";
    // 256
    SaxEventType[SaxEventType["CloseTag"] = 256] = "CloseTag";
    // 512
    SaxEventType[SaxEventType["Cdata"] = 512] = "Cdata";
})(SaxEventType || (SaxEventType = {}));
/**
 * Abstract class for decoding SAX event data.
 *
 * @template T - The type of detail to be read.
 */
export class Reader {
    data;
    memory;
    cache = {};
    dataView;
    /**
     * Creates a new Reader instance.
     *
     * @param data - The data buffer containing the event data.
     * @param ptr - The initial pointer position.
     * @param memory - The WebAssembly memory instance.
     */
    constructor(data, memory) {
        this.data = data;
        this.memory = memory;
        this.dataView = new Uint8Array(memory.buffer);
    }
}
/**
 * Class representing the line and character
 * integers for entities that are encountered
 * in the document.
 */
export class Position {
    line;
    character;
    /**
     * Creates a new Position instance.
     *
     * @param line - The line number.
     * @param character - The character position.
     */
    constructor(line, character) {
        this.line = line;
        this.character = character;
    }
}
/**
 * Represents the different types of attributes.
 */
export var AttributeType;
(function (AttributeType) {
    AttributeType[AttributeType["Normal"] = 0] = "Normal";
    AttributeType[AttributeType["JSX"] = 1] = "JSX";
})(AttributeType || (AttributeType = {}));
/**
 * Represents an attribute in the XML data.
 *
 * This class decodes the Attribute data sent across
 * the FFI boundary. Encoded data has the following schema:
 *
 * 1. AttributeType - byte position 0 (1 bytes)
 * 2. name_length - length of the 'name' Text - byte position 1-4 (4 bytes)
 * 3. 'name' bytes - byte position 5-name_length (name_length bytes)
 * 4. 'value' bytes - byte position name_length-n (n bytes)
 */
export class Attribute extends Reader {
    static LENGTH = 76;
    type;
    name;
    value;
    constructor(data, memory) {
        super(data, memory);
        this.name = new Text(new Uint8Array(data.buffer, data.byteOffset, Text.LENGTH), memory);
        this.value = new Text(new Uint8Array(data.buffer, data.byteOffset + Text.LENGTH, Text.LENGTH), memory);
        this.type = data[64];
    }
    /**
     * @inheritdoc
     */
    toBoxed() {
        this.name.toBoxed();
        this.value.toBoxed();
        this.memory = undefined;
    }
    /**
     * @inheritDoc
     */
    toJSON() {
        const { name, value, type } = this;
        return { name, value, type };
    }
    /**
     * Converts the attribute to a string representation.
     *
     * @returns A string representing the attribute.
     */
    toString() {
        const { name, value } = this;
        return this.type === AttributeType.JSX
            ? `${name}="{${value}}"`
            : `${name}="${value}"`;
    }
}
/**
 * Represents a processing instruction in the XML data.
 *
 * This class decodes the processing instruction data sent across the FFI boundary.
 * The encoded data has the following schema:
 *
 * 1. Start position (line and character) - byte positions 0-7 (8 bytes)
 * 2. End position (line and character) - byte positions 8-15 (8 bytes)
 * 3. Target length - byte positions 16-19 (4 bytes)
 * 4. Target bytes - byte positions 20-(20 + target length - 1) (target length bytes)
 * 5. Content bytes - byte positions (20 + target length)-(end of buffer) (remaining bytes)
 *
 * The `ProcInst` class decodes this data into its respective fields: `start`, `end`, `target`, and `content`.
 *
 * # Fields
 *
 * * `start` - The start position of the processing instruction.
 * * `end` - The end position of the processing instruction.
 * * `target` - The target of the processing instruction.
 * * `content` - The content of the processing instruction.
 *
 * # Arguments
 *
 * * `buffer` - The buffer containing the processing instruction data.
 * * `ptr` - The initial pointer position.
 */
export class ProcInst extends Reader {
    static LENGTH = 80;
    target;
    content;
    constructor(data, memory) {
        super(data, memory);
        this.target = new Text(new Uint8Array(data.buffer, data.byteOffset + 24, Text.LENGTH), memory);
        this.content = new Text(new Uint8Array(data.buffer, data.byteOffset + 24 + Text.LENGTH, Text.LENGTH), memory);
    }
    /**
     * @inheritdoc
     */
    toBoxed() {
        this.data = this.data.slice();
        this.target.toBoxed();
        this.content.toBoxed();
        this.memory = undefined;
    }
    /**
     * Gets the start position of the processing instruction.
     *
     * @returns The start position of the processing instruction.
     */
    get start() {
        return (this.cache.start ||
            (this.cache.start = readPosition(this.data, 8)));
    }
    /**
     * Gets the start position of the processing instruction.
     *
     * @returns The start position of the processing instruction.
     */
    get end() {
        return (this.cache.end ||
            (this.cache.end = readPosition(this.data, 16)));
    }
    /**
     * Converts the processing instruction to a JSON object.
     *
     * @returns A JSON object representing the processing instruction.
     */
    toJSON() {
        const { start, end, target, content } = this;
        return { start, end, target, content };
    }
    /**
     * @inheritdoc
     */
    toString() {
        const { target, content } = this;
        return `<? ${target} ${content} ?>`;
    }
}
/**
 * Represents a text node in the XML data.
 *
 * This class decodes the text node data sent across the FFI boundary
 * into its respective fields: `start`, `end`, and `value`.
 */
export class Text extends Reader {
    static LENGTH = 36;
    /**
     * Gets the start position of the text node.
     *
     * @returns The start position of the text node.
     */
    get start() {
        return this.cache.start || (this.cache.start = readPosition(this.data, 20));
    }
    /**
     * Gets the end position of the text node.
     *
     * @returns The end position of the text node.
     */
    get end() {
        return this.cache.end || (this.cache.end = readPosition(this.data, 28));
    }
    /**
     * @inheritdoc
     */
    toBoxed() {
        this.data = this.data.slice();
        // Build our data view and update the pointer
        const vecPtr = readU32(this.data, 12);
        const valueLen = readU32(this.data, 16);
        this.dataView = new Uint8Array(this.memory.buffer, vecPtr, valueLen).slice();
        this.data.set([0, 0, 0, 0], 12); // Set the vecPtr to 0
        this.memory = undefined;
    }
    /**
     * Gets the value of the text node.
     *
     * @returns The value of the text node.
     */
    get value() {
        if (this.cache.value) {
            return this.cache.value;
        }
        const vecPtr = readU32(this.data, 12);
        const valueLen = readU32(this.data, 16);
        return (this.cache.value = readString(this.dataView, vecPtr, valueLen));
    }
    /**
     * Converts the text node to a JSON object.
     *
     * @returns A JSON object representing the text node.
     */
    toJSON() {
        const { start, end, value } = this;
        return { start, end, value };
    }
    /**
     * Converts the text node to a string representation.
     *
     * @returns A string representing the text node.
     */
    toString() {
        return this.value;
    }
}
/**
 * Represents a tag in the XML data.
 *
 * This class decodes the tag data sent across the FFI boundary
 * into its respective fields: `openStart`, `openEnd`, `closeStart`,
 * `closeEnd`, `selfClosing`, `name`, `attributes`, and `textNodes`.
 */
export class Tag extends Reader {
    static LENGTH = 82;
    /**
     * @inheritdoc
     */
    toBoxed() {
        delete this.cache.attributes;
        delete this.cache.textNodes;
        this.data = this.data.slice();
        for (const textNode of this.textNodes) {
            textNode.toBoxed();
        }
        for (const attribute of this.attributes) {
            attribute.toBoxed();
        }
        this.memory = undefined;
    }
    /**
     * Gets the start position of the tag opening.
     *
     * @returns The start position of the tag opening.
     */
    get openStart() {
        return (this.cache.openStart ||
            (this.cache.openStart = readPosition(this.data, 40)));
    }
    /**
     * Gets the end position of the tag opening.
     *
     * @returns The end position of the tag opening.
     */
    get openEnd() {
        return (this.cache.openEnd ||
            (this.cache.openEnd = readPosition(this.data, 48)));
    }
    /**
     * Gets the start position of the tag closing.
     *
     * @returns The start position of the tag closing.
     */
    get closeStart() {
        return (this.cache.closeStart ||
            (this.cache.closeStart = readPosition(this.data, 56)));
    }
    /**
     * Gets the end position of the tag closing.
     *
     * @returns The end position of the tag closing.
     */
    get closeEnd() {
        return (this.cache.closeEnd ||
            (this.cache.closeEnd = readPosition(this.data, 64)));
    }
    /**
     * Gets the self-closing flag of the tag.
     *
     * @returns The self-closing flag of the tag.
     */
    get selfClosing() {
        return !!this.data[44];
    }
    /**
     * Gets the name of the tag.
     *
     * @returns The name of the tag.
     */
    get name() {
        if (this.cache.name) {
            return this.cache.name;
        }
        const vecPtr = readU32(this.data, 4);
        const valueLen = readU32(this.data, 8);
        return (this.cache.name = readString(this.dataView, vecPtr, valueLen));
    }
    /**
     * Gets the attributes of the tag.
     *
     * @returns An array of attributes of the tag.
     * @see Attribute
     */
    get attributes() {
        if (this.cache.attributes) {
            return this.cache.attributes;
        }
        // starting location of the attribute block
        let ptr = readU32(this.data, 16);
        const numAttrs = readU32(this.data, 20);
        const attributes = [];
        for (let i = 0; i < numAttrs; i++) {
            const attrVecData = new Uint8Array(this.dataView.buffer, ptr, Attribute.LENGTH);
            attributes[i] = new Attribute(attrVecData, this.memory);
            ptr += Attribute.LENGTH;
        }
        return (this.cache.attributes = attributes);
    }
    /**
     * Gets the text nodes within the tag.
     *
     * @returns An array of text nodes within the tag.
     * @see Text
     */
    get textNodes() {
        if (this.cache.textNodes) {
            return this.cache.textNodes;
        }
        // starting location of the text nodes block
        let ptr = readU32(this.data, 28);
        const numTextNodes = readU32(this.data, 32);
        const textNodes = [];
        for (let i = 0; i < numTextNodes; i++) {
            const textVecData = new Uint8Array(this.dataView.buffer, ptr, Text.LENGTH);
            textNodes[i] = new Text(textVecData, this.memory);
            ptr += Text.LENGTH;
        }
        return (this.cache.textNodes = textNodes);
    }
    /**
     * Converts the tag to a JSON object.
     *
     * @returns A JSON object representing the tag.
     */
    toJSON() {
        const { openStart, openEnd, closeStart, closeEnd, name, attributes, textNodes, selfClosing, } = this;
        return {
            openStart,
            openEnd,
            closeStart,
            closeEnd,
            name,
            attributes,
            textNodes,
            selfClosing,
        };
    }
    get value() {
        return this.name;
    }
}
export class SAXParser {
    static textDecoder; // Web only
    events;
    wasmSaxParser;
    eventHandler;
    writeBuffer;
    constructor(events = 0) {
        const self = this;
        Object.defineProperties(this, {
            events: {
                get: () => ~~events,
                set: (value) => {
                    if (events === ~~value) {
                        return;
                    }
                    events = ~~value;
                    if (self.wasmSaxParser) {
                        self.wasmSaxParser.parser(events);
                    }
                },
                configurable: false,
                enumerable: true,
            },
        });
    }
    /**
     * Parses the XML data from a readable stream.
     *
     * This function takes a readable stream of `Uint8Array` chunks and processes them using the SAX parser.
     * It yields events and their details as they are parsed.
     *
     * # Arguments
     *
     * * `reader` - A readable stream reader for `Uint8Array` chunks.
     *
     * # Returns
     *
     * * An async generator yielding tuples of `SaxEventType` and `Detail`.
     *
     * # Examples
     *
     * ```ts
     * // Node.js example
     * import { createReadStream } from 'fs';
     * import { resolve as pathResolve } from 'path';
     * import { Readable } from 'stream';
     * import { SAXParser, SaxEventType, Detail } from 'sax-wasm';
     *
     * (async () => {
     *   const parser = new SAXParser(SaxEventType.Text | SaxEventType.OpenTag);
     *   const options = { encoding: 'utf8' };
     *   const readable = createReadStream(pathResolve('path/to/your.xml'), options);
     *   const webReadable = Readable.toWeb(readable);
     *
     *   for await (const [event, detail] of parser.parse(webReadable.getReader())) {
     *     // Do something with these
     *   }
     * })();
     *
     * // Browser example
     * import { SAXParser, SaxEventType, Detail } from 'sax-wasm';
     *
     * (async () => {
     *   const parser = new SAXParser(SaxEventType.Text | SaxEventType.OpenTag);
     *   const response = await fetch('path/to/your.xml');
     *   const reader = response.body.getReader();
     *
     *   for await (const [event, detail] of parser.parse(reader)) {
     *     // Do something with these
     *   }
     * })();
     * ```
     */
    async *parse(reader) {
        let eventAggregator = [];
        this.eventHandler = function (event, detail) {
            eventAggregator.push([event, detail]);
        };
        while (true) {
            const chunk = await reader.read();
            if (chunk.done) {
                return this.end();
            }
            this.write(chunk.value);
            if (eventAggregator.length) {
                for (const event of eventAggregator) {
                    yield event;
                }
                eventAggregator.length = 0;
            }
        }
    }
    /**
     * Writes a chunk of data to the parser.
     *
     * This function takes a `Uint8Array` chunk and processes it using the SAX parser.
     *
     * # Arguments
     *
     * * `chunk` - A `Uint8Array` chunk representing the data to be parsed.
     *
     * # Examples
     *
     * ```ts
     * // Node.js example
     * import { createReadStream } from 'node:fs';
     * import { resolve as pathResolve } from 'node:path';
     * import { Readable } from 'stream';
     * import { SAXParser, SaxEventType } from 'sax-wasm';
     *
     * (async () => {
     *   const parser = new SAXParser(SaxEventType.Text | SaxEventType.OpenTag);
     *   await parser.prepareWasm(fetch('path/to/your.wasm'));
     *   const options = { encoding: 'utf8' };
     *   const readable = createReadStream(pathResolve(__dirname + '/xml.xml'), options);
     *   const webReadable = Readable.toWeb(readable);
     *
     *   for await (const chunk of webReadable.getReader()) {
     *     parser.write(chunk);
     *   }
     *   parser.end();
     * })();
     *
     * // Browser example
     * import { SAXParser, SaxEventType } from 'sax-wasm';
     *
     * (async () => {
     *   const parser = new SAXParser(SaxEventType.Text | SaxEventType.OpenTag);
     *   await parser.prepareWasm(fetch('path/to/your.wasm'));
     *   const response = await fetch('path/to/your.xml');
     *   const reader = response.body.getReader();
     *
     *   while (true) {
     *     const { done, value } = await reader.read();
     *     if (done) break;
     *     parser.write(value);
     *   }
     *   parser.end();
     * })();
     * ```
     */
    write(chunk) {
        if (!this.wasmSaxParser) {
            return;
        }
        const { write, memory: { buffer } } = this.wasmSaxParser;
        // Allocations within the WASM process
        // invalidate reference to the memory buffer.
        // We check for this and create a new Uint8Array
        // with the new memory buffer reference if needed.
        // **NOTE** These allocations can slow down parsing
        // if they become excessive. Consider adjusting the
        // highWaterMark in the options up or down to find the optimal
        // memory allocation to prevent too many new Uint8Array instances.
        if (this.writeBuffer?.buffer !== buffer) {
            this.writeBuffer = new Uint8Array(buffer);
        }
        this.writeBuffer.set(chunk, 0);
        write(0, chunk.byteLength);
    }
    /**
     * Ends the parsing process.
     *
     * This function signals the end of the parsing process notifies
     * the WASM binary to flush buffers and normalize.
     */
    end() {
        this.writeBuffer = undefined;
        this.wasmSaxParser?.end();
    }
    async prepareWasm(saxWasm) {
        let result;
        const env = {
            memory: new WebAssembly.Memory({ initial: 10, shared: true, maximum: 150 }),
            table: new WebAssembly.Table({ initial: 1, element: 'anyfunc' }),
            event_listener: this.eventTrap
        };
        if (saxWasm instanceof Uint8Array) {
            result = await WebAssembly.instantiate(saxWasm, { env });
        }
        else {
            result = await WebAssembly.instantiateStreaming(saxWasm, { env });
        }
        if (result && typeof this.events === 'number') {
            const { parser } = this.wasmSaxParser = result.instance.exports;
            parser(this.events);
            return true;
        }
        throw new Error(`Failed to instantiate the parser.`);
    }
    eventTrap = (event, ptr) => {
        if (!this.wasmSaxParser) {
            return;
        }
        const memoryBuffer = this.wasmSaxParser.memory.buffer;
        let detail;
        switch (event) {
            case SaxEventType.Attribute:
                detail = new Attribute(new Uint8Array(memoryBuffer, ptr, Attribute.LENGTH), this.wasmSaxParser.memory);
                break;
            case SaxEventType.ProcessingInstruction:
                detail = new ProcInst(new Uint8Array(memoryBuffer, ptr, ProcInst.LENGTH), this.wasmSaxParser.memory);
                break;
            case SaxEventType.OpenTag:
            case SaxEventType.CloseTag:
            case SaxEventType.OpenTagStart:
                detail = new Tag(new Uint8Array(memoryBuffer, ptr, Tag.LENGTH), this.wasmSaxParser.memory);
                break;
            case SaxEventType.Text:
            case SaxEventType.Cdata:
            case SaxEventType.Comment:
            case SaxEventType.Doctype:
            case SaxEventType.SGMLDeclaration:
                detail = new Text(new Uint8Array(memoryBuffer, ptr, Text.LENGTH), this.wasmSaxParser.memory);
                break;
            default:
                throw new Error("No reader for this event type");
        }
        const js = JSON.parse(JSON.stringify(detail));
        if (this.eventHandler) {
            this.eventHandler(event, detail);
        }
    };
}
export const readString = (data, offset, length) => {
    // Node
    if (typeof Buffer !== 'undefined') {
        return Buffer.from(data.buffer, data.byteOffset + offset, length).toString();
    }
    // Web
    return (SAXParser.textDecoder || (SAXParser.textDecoder = new TextDecoder())).decode(data.subarray(offset, offset + length));
};
export const readU32 = (uint8Array, ptr) => (uint8Array[ptr + 3] << 24) |
    (uint8Array[ptr + 2] << 16) |
    (uint8Array[ptr + 1] << 8) |
    uint8Array[ptr];
export const readPosition = (uint8Array, ptr = 0) => {
    const line = readU32(uint8Array, ptr);
    const character = readU32(uint8Array, ptr + 4);
    return new Position(line, character);
};
//# sourceMappingURL=saxWasm.js.map