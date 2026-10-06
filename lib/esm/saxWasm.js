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
 * Note that minimizing the number of events will have a
 * slight performance improvement which becomes more noticeable
 * on very large documents.
 */
export const SaxEventType = {
    Text: 0b1,
    ProcessingInstruction: 0b10,
    Declaration: 0b100,
    Doctype: 0b1000,
    Comment: 0b10000,
    OpenTagStart: 0b100000,
    Attribute: 0b1000000,
    OpenTag: 0b10000000,
    CloseTag: 0b100000000,
    Cdata: 0b1000000000,
};
/**
 * Represents the different types of attributes.
 */
export var AttributeType;
(function (AttributeType) {
    AttributeType[AttributeType["NoValue"] = 0] = "NoValue";
    AttributeType[AttributeType["JSX"] = 1] = "JSX";
    AttributeType[AttributeType["NoQuotes"] = 2] = "NoQuotes";
    AttributeType[AttributeType["SingleQuoted"] = 4] = "SingleQuoted";
    AttributeType[AttributeType["DoubleQuoted"] = 8] = "DoubleQuoted";
})(AttributeType || (AttributeType = {}));
const memoryViews = new WeakMap();
const viewsFor = (memory) => {
    let views = memoryViews.get(memory);
    if (!views || views.buffer.byteLength === 0 || (views.shared && views.buffer !== memory.buffer)) {
        const buffer = memory.buffer;
        views = { buffer, bytes: new Uint8Array(buffer), view: new DataView(buffer), shared: typeof SharedArrayBuffer !== 'undefined' && buffer instanceof SharedArrayBuffer };
        memoryViews.set(memory, views);
    }
    return views;
};
/** Abstract class for decoding SAX event data directly from linear memory. */
export class Reader {
    memory;
    descriptorABI;
    cache = {};
    pointer;
    views;
    dataBytes;
    copiedView;
    currentViews() {
        if (this.views.buffer.byteLength === 0 || (this.views.shared && this.views.buffer !== this.memory.buffer)) {
            this.views = viewsFor(this.memory);
        }
        return this.views;
    }
    get dataView() {
        return this.currentViews().bytes;
    }
    // Preserve the protected struct view for subclasses, but built-in readers
    // read fields by offset without allocating a typed array for each entity.
    get data() {
        if (this.copiedView) {
            return this.dataBytes;
        }
        const { buffer } = this.currentViews();
        if (!this.dataBytes || this.dataBytes.buffer !== buffer) {
            const length = this.constructor[this.descriptorABI ? 'DESCRIPTOR_LENGTH' : 'LENGTH'];
            this.dataBytes = new Uint8Array(buffer, this.pointer, length);
        }
        return this.dataBytes;
    }
    set data(data) {
        this.pointer = data.byteOffset;
        this.dataBytes = data;
        this.copiedView = data.buffer === this.currentViews().buffer ? undefined : new DataView(data.buffer);
    }
    constructor(data, memory, descriptorABI = false) {
        this.memory = memory;
        this.descriptorABI = descriptorABI;
        this.pointer = typeof data === 'number' ? data : data.byteOffset;
        this.dataBytes = typeof data === 'number' ? undefined : data;
        this.views = viewsFor(memory);
        this.copiedView = typeof data !== 'number' && data.buffer !== this.views.buffer ? new DataView(data.buffer) : undefined;
    }
    childData(offset, length) {
        return this.copiedView ? new Uint8Array(this.copiedView.buffer, this.pointer + offset, length) : this.pointer + offset;
    }
    readU32(offset) {
        return (this.copiedView ?? this.currentViews().view).getUint32(this.pointer + offset, true);
    }
    readU64(offset) {
        const view = this.copiedView ?? this.currentViews().view;
        const ptr = this.pointer + offset;
        return view.getUint32(ptr, true) + view.getUint32(ptr + 4, true) * 0x1_0000_0000;
    }
    readPosition(offset) {
        const view = this.copiedView ?? this.currentViews().view;
        const ptr = this.pointer + offset;
        return new Position(view.getUint32(ptr, true) + view.getUint32(ptr + 4, true) * 0x1_0000_0000, view.getUint32(ptr + 8, true) + view.getUint32(ptr + 12, true) * 0x1_0000_0000);
    }
    readByte(offset) {
        if (this.copiedView) {
            return this.copiedView.getUint8(this.pointer + offset);
        }
        return this.currentViews().bytes[this.pointer + offset];
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
    static LENGTH = 168;
    static DESCRIPTOR_LENGTH = 136;
    type;
    get name() {
        return (this.cache.name ??= new Text(this.childData(0, this.descriptorABI ? Text.DESCRIPTOR_LENGTH : Text.LENGTH), this.memory, this.descriptorABI));
    }
    set name(value) {
        this.cache.name = value;
    }
    get value() {
        return (this.cache.value ??= new Text(this.childData(this.descriptorABI ? Text.DESCRIPTOR_LENGTH : Text.LENGTH, this.descriptorABI ? Text.DESCRIPTOR_LENGTH : Text.LENGTH), this.memory, this.descriptorABI));
    }
    set value(value) {
        this.cache.value = value;
    }
    constructor(data, memory, descriptorABI = false) {
        super(data, memory, descriptorABI);
        this.type = this.readByte(this.descriptorABI ? 112 : 144);
    }
    /**
    * Gets the byte offsets representing the
    * start and end byte in the data
    */
    get byteOffsets() {
        return (this.cache.byteOffsets ??= {
            start: this.readU64(this.descriptorABI ? 120 : 152),
            end: this.readU64(this.descriptorABI ? 128 : 160)
        });
    }
    /**
     * @inheritDoc
     */
    toJSON() {
        const { name, value, type, byteOffsets } = this;
        return { name: name.toJSON(), value: value.toJSON(), type, byteOffsets };
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
    static LENGTH = 186;
    static DESCRIPTOR_LENGTH = 160;
    get target() {
        return (this.cache.target ??= new Text(this.childData(32, this.descriptorABI ? Text.DESCRIPTOR_LENGTH : Text.LENGTH), this.memory, this.descriptorABI));
    }
    set target(value) {
        this.cache.target = value;
    }
    get content() {
        return (this.cache.content ??= new Text(this.childData(32 + (this.descriptorABI ? Text.DESCRIPTOR_LENGTH : Text.LENGTH), this.descriptorABI ? Text.DESCRIPTOR_LENGTH : Text.LENGTH), this.memory, this.descriptorABI));
    }
    set content(value) {
        this.cache.content = value;
    }
    /**
     * Gets the start position of the processing instruction.
     *
     * @returns The start position of the processing instruction.
     */
    get start() {
        return (this.cache.start ||
            (this.cache.start = this.readPosition(0)));
    }
    /**
     * Gets the start position of the processing instruction.
     *
     * @returns The start position of the processing instruction.
     */
    get end() {
        return (this.cache.end ||
            (this.cache.end = this.readPosition(16)));
    }
    /**
     * Gets the byte offsets representing the
     * start and end byte in the data
     */
    get byteOffsets() {
        return (this.cache.byteOffsets ??= {
            start: this.readU64(16),
            end: this.readU64(24),
        });
    }
    /**
     * Converts the processing instruction to a JSON object.
     *
     * @returns A JSON object representing the processing instruction.
     */
    toJSON() {
        const { start, end, target, content, byteOffsets } = this;
        return { start, end, target: target.toJSON(), content: content.toJSON(), byteOffsets };
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
    static LENGTH = 72;
    static DESCRIPTOR_LENGTH = 56;
    /**
     * Gets the start position of the text node.
     *
     * @returns The start position of the text node.
     */
    get start() {
        return this.cache.start || (this.cache.start = this.readPosition(this.descriptorABI ? 8 : 24));
    }
    /**
     * Gets the end position of the text node.
     *
     * @returns The end position of the text node.
     */
    get end() {
        return this.cache.end || (this.cache.end = this.readPosition(this.descriptorABI ? 24 : 40));
    }
    /**
     * Gets the value of the text node.
     *
     * @returns The value of the text node.
     */
    get value() {
        if (this.cache.value !== undefined) {
            return this.cache.value;
        }
        const vecPtr = this.readU32(this.descriptorABI ? 0 : 12);
        const valueLen = this.readU32(this.descriptorABI ? 4 : 16);
        return (this.cache.value = readString(this.dataView, vecPtr, valueLen));
    }
    /**
    * Gets the byte offsets representing the
    * start and end byte in the data
    */
    get byteOffsets() {
        return (this.cache.byteOffsets ??= {
            start: this.readU64(this.descriptorABI ? 40 : 56),
            end: this.readU64(this.descriptorABI ? 48 : 64)
        });
    }
    /**
     * Converts the text node to a JSON object.
     *
     * @returns A JSON object representing the text node.
     */
    toJSON() {
        const { start, end, value, byteOffsets } = this;
        return { start, end, value, byteOffsets };
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
    static LENGTH = 128;
    static DESCRIPTOR_LENGTH = 112;
    /**
     * Gets the start position of the tag opening.
     *
     * @returns The start position of the tag opening.
     */
    get openStart() {
        return (this.cache.openStart ||
            (this.cache.openStart = this.readPosition(this.descriptorABI ? 32 : 40)));
    }
    /**
     * Gets the end position of the tag opening.
     *
     * @returns The end position of the tag opening.
     */
    get openEnd() {
        return (this.cache.openEnd ||
            (this.cache.openEnd = this.readPosition(this.descriptorABI ? 48 : 56)));
    }
    /**
     * Gets the start position of the tag closing.
     *
     * @returns The start position of the tag closing.
     */
    get closeStart() {
        return (this.cache.closeStart ||
            (this.cache.closeStart = this.readPosition(this.descriptorABI ? 64 : 72)));
    }
    /**
     * Gets the end position of the tag closing.
     *
     * @returns The end position of the tag closing.
     */
    get closeEnd() {
        return (this.cache.closeEnd ||
            (this.cache.closeEnd = this.readPosition(this.descriptorABI ? 80 : 88)));
    }
    /**
     * Gets the self-closing flag of the tag.
     *
     * @returns The self-closing flag of the tag.
     */
    get selfClosing() {
        return !!this.readByte(this.descriptorABI ? 24 : 36);
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
        const vecPtr = this.readU32(this.descriptorABI ? 0 : 4);
        const valueLen = this.readU32(this.descriptorABI ? 4 : 8);
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
        let ptr = this.readU32(this.descriptorABI ? 8 : 16);
        const numAttrs = this.readU32(this.descriptorABI ? 12 : 20);
        const attributes = [];
        for (let i = 0; i < numAttrs; i++) {
            attributes[i] = new Attribute(ptr, this.memory, this.descriptorABI);
            ptr += this.descriptorABI ? Attribute.DESCRIPTOR_LENGTH : Attribute.LENGTH;
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
        let ptr = this.readU32(this.descriptorABI ? 16 : 28);
        const numTextNodes = this.readU32(this.descriptorABI ? 20 : 32);
        const textNodes = [];
        for (let i = 0; i < numTextNodes; i++) {
            textNodes[i] = new Text(ptr, this.memory, this.descriptorABI);
            ptr += this.descriptorABI ? Text.DESCRIPTOR_LENGTH : Text.LENGTH;
        }
        return (this.cache.textNodes = textNodes);
    }
    /**
    * Gets the byte offsets representing the
    * start and end byte in the data
    */
    get byteOffsets() {
        return (this.cache.byteOffsets ??= {
            start: this.readU64(this.descriptorABI ? 96 : 112),
            end: this.readU64(this.descriptorABI ? 104 : 120)
        });
    }
    /**
     * Converts the tag to a JSON object.
     *
     * @returns A JSON object representing the tag.
     */
    toJSON() {
        const { openStart, openEnd, closeStart, closeEnd, name, attributes, textNodes, selfClosing, byteOffsets } = this;
        return {
            openStart,
            openEnd,
            closeStart,
            closeEnd,
            name,
            attributes: attributes.map(a => a.toJSON()),
            textNodes: textNodes.map(t => t.toJSON()),
            selfClosing,
            byteOffsets,
        };
    }
    get value() {
        return this.name;
    }
}
export class SAXParser {
    static textDecoder = new TextDecoder();
    events;
    wasmSaxParser;
    eventHandler;
    createDetailConstructor(Constructor) {
        return (ptr) => {
            return new Constructor(ptr, this.wasmSaxParser.memory, this.descriptorABI);
        };
    }
    eventConstructors = [];
    writeBuffer;
    descriptorABI = false;
    constructor(events = 0) {
        const self = this;
        // Initialize a fast lookup table for event constructors to avoid Map lookups per event.
        this.eventConstructors[SaxEventType.Attribute] = this.createDetailConstructor(Attribute);
        this.eventConstructors[SaxEventType.ProcessingInstruction] = this.createDetailConstructor(ProcInst);
        this.eventConstructors[SaxEventType.OpenTag] = this.createDetailConstructor(Tag);
        this.eventConstructors[SaxEventType.CloseTag] = this.createDetailConstructor(Tag);
        this.eventConstructors[SaxEventType.OpenTagStart] = this.createDetailConstructor(Tag);
        this.eventConstructors[SaxEventType.Text] = this.createDetailConstructor(Text);
        this.eventConstructors[SaxEventType.Cdata] = this.createDetailConstructor(Text);
        this.eventConstructors[SaxEventType.Comment] = this.createDetailConstructor(Text);
        this.eventConstructors[SaxEventType.Doctype] = this.createDetailConstructor(Text);
        this.eventConstructors[SaxEventType.Declaration] = this.createDetailConstructor(Text);
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
        this.writeBuffer.set(chunk, 4);
        write(4, chunk.byteLength);
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
        const env = {
            memory: new WebAssembly.Memory({ initial: 10, shared: true, maximum: 150 }),
            table: new WebAssembly.Table({ initial: 1, element: 'anyfunc' }),
            event_listener: this.eventTrap,
            event_listener_v1: this.eventTrap
        };
        let instance;
        if (saxWasm instanceof Uint8Array) {
            const result = await WebAssembly.instantiate(saxWasm.buffer, { env });
            instance = result?.instance;
        }
        else if (saxWasm instanceof WebAssembly.Module) {
            instance = await WebAssembly.instantiate(saxWasm, { env });
        }
        else {
            const result = await WebAssembly.instantiateStreaming(saxWasm, { env });
            instance = result?.instance;
        }
        if (instance && typeof this.events === 'number') {
            const { parser } = this.wasmSaxParser = instance.exports;
            const abi = this.wasmSaxParser.event_abi_version?.() ?? 0;
            if (abi !== 0 && abi !== 1) {
                throw new Error(`Unsupported SAX event ABI version: ${abi}`);
            }
            this.descriptorABI = abi === 1;
            parser(this.events);
            return true;
        }
        throw new Error(`Failed to instantiate the parser.`);
    }
    eventTrap = (event, ptr) => {
        if (!this.wasmSaxParser || !this.eventHandler) {
            return;
        }
        let detail;
        const ctor = this.eventConstructors[event];
        if (ctor) {
            detail = ctor(ptr);
        }
        else {
            throw new Error("No reader for this event type");
        }
        this.eventHandler(event, detail);
    };
}
export const readString = (data, offset, length) => SAXParser.textDecoder.decode(data.subarray(offset, offset + length));
let cachedDataBuffer = null;
let cachedDataView = null;
const dataViewFor = (array) => {
    const buffer = array.buffer;
    if (buffer !== cachedDataBuffer) {
        cachedDataBuffer = buffer;
        cachedDataView = new DataView(buffer);
    }
    return cachedDataView;
};
export const readU32 = (uint8Array, ptr) => {
    const view = dataViewFor(uint8Array);
    return view.getUint32(uint8Array.byteOffset + ptr, true);
};
/**
 * Reads a u64 as a javascript number. This
 * will limit precision to 2⁵³ - 1 or 53 bits
 * or Number.MAX_SAFE_INTEGER or an XML document
 * that's 8,388,608 GB in size.
 *
 * When working with strings in JS, 64 bit
 * bigints don't make sense because string
 * length limits will be encountered before
 * reaching these values.
 *
 * @param uint8Array The data to read the u64 from
 * @param ptr The offset to start at
 * @returns number
 */
function readU64(uint8Array, ptr = 0) {
    const view = dataViewFor(uint8Array);
    const lo = view.getUint32(uint8Array.byteOffset + ptr, true);
    const hi = view.getUint32(uint8Array.byteOffset + ptr + 4, true);
    return lo + hi * 0x1_0000_0000;
}
export const readPosition = (uint8Array, ptr = 0) => {
    const line = readU64(uint8Array, ptr);
    const character = readU64(uint8Array, ptr + 8);
    return new Position(line, character);
};
