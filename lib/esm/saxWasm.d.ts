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
export declare enum SaxEventType {
    Text = 1,
    ProcessingInstruction = 2,
    SGMLDeclaration = 4,
    Doctype = 8,
    Comment = 16,
    OpenTagStart = 32,
    Attribute = 64,
    OpenTag = 128,
    CloseTag = 256,
    Cdata = 512
}
/**
 * Represents the detail of a SAX event.
 */
export type Detail = Position | Attribute | Text | Tag | ProcInst;
/**
 * Abstract class for decoding SAX event data.
 *
 * @template T - The type of detail to be read.
 */
export declare abstract class Reader<T = Detail> {
    protected data: Uint8Array;
    protected cache: {
        [prop: string]: T;
    };
    protected ptr: number;
    /**
     * Creates a new Reader instance.
     *
     * @param data - The data to be read.
     * @param ptr - The initial pointer position.
     */
    constructor(data: Uint8Array, ptr?: number);
    /**
     * Converts the reader data to a JSON object.
     *
     * @returns A JSON object representing the reader data.
     */
    abstract toJSON(): {
        [prop: string]: T;
    };
}
/**
 * Class representing the line and character
 * integers for entities that are encountered
 * in the document.
 */
export declare class Position {
    line: number;
    character: number;
    /**
     * Creates a new Position instance.
     *
     * @param line - The line number.
     * @param character - The character position.
     */
    constructor(line: number, character: number);
}
/**
 * Represents the different types of attributes.
 */
export declare enum AttributeType {
    Normal = 0,
    JSX = 1
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
export declare class Attribute extends Reader<Text | AttributeType> {
    type: AttributeType;
    name: Text;
    value: Text;
    /**
     * Creates a new Attribute instance.
     *
     * @param buffer - The buffer containing the attribute data.
     * @param ptr - The initial pointer position.
     */
    constructor(buffer: Uint8Array, ptr?: number);
    /**
     * @inheritDoc
     */
    toJSON(): {
        [prop: string]: Text | AttributeType;
    };
    /**
     * Converts the attribute to a string representation.
     *
     * @returns A string representing the attribute.
     */
    toString(): string;
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
export declare class ProcInst extends Reader<Position | Text> {
    target: Text;
    content: Text;
    /**
     * Creates a new ProcInst instance.
     *
     * @param buffer - The buffer containing the processing instruction data.
     * @param ptr - The initial pointer position.
     */
    constructor(buffer: Uint8Array, ptr?: number);
    /**
     * Gets the start position of the processing instruction.
     *
     * @returns The start position of the processing instruction.
     */
    get start(): Position;
    /**
     * Gets the start position of the processing instruction.
     *
     * @returns The start position of the processing instruction.
     */
    get end(): Position;
    /**
     * Converts the processing instruction to a JSON object.
     *
     * @returns A JSON object representing the processing instruction.
     */
    toJSON(): {
        [p: string]: Position | Text;
    };
    toString(): string;
}
/**
 * Represents a text node in the XML data.
 *
 * This class decodes the text node data sent across the FFI boundary.
 * The encoded data has the following schema:
 *
 * 1. Start position (line and character) - byte positions 0-7 (8 bytes)
 * 2. End position (line and character) - byte positions 8-15 (8 bytes)
 * 3. Value length - byte positions 16-19 (4 bytes)
 * 4. Value bytes - byte positions 20-(20 + value length - 1) (value length bytes)
 *
 * The `Text` class decodes this data into its respective fields: `start`, `end`, and `value`.
 *
 * # Fields
 *
 * * `start` - The start position of the text node.
 * * `end` - The end position of the text node.
 * * `value` - The value of the text node.
 *
 * # Arguments
 *
 * * `buffer` - The buffer containing the text node data.
 * * `ptr` - The initial pointer position.
 */
export declare class Text extends Reader<string | Position> {
    /**
     * Gets the start position of the text node.
     *
     * @returns The start position of the text node.
     */
    get start(): Position;
    /**
     * Gets the end position of the text node.
     *
     * @returns The end position of the text node.
     */
    get end(): Position;
    /**
     * Gets the value of the text node.
     *
     * @returns The value of the text node.
     */
    get value(): string;
    /**
     * Converts the text node to a JSON object.
     *
     * @returns A JSON object representing the text node.
     */
    toJSON(): {
        [prop: string]: string | Position;
    };
    /**
     * Converts the text node to a string representation.
     *
     * @returns A string representing the text node.
     */
    toString(): string;
}
/**
 * Represents a tag in the XML data.
 *
 * This class decodes the tag data sent across the FFI boundary.
 * The encoded data has the following schema:
 *
 * 1. Start position of the tag opening (line and character) - byte positions 8-15 (8 bytes)
 * 2. End position of the tag opening (line and character) - byte positions 16-23 (8 bytes)
 * 3. Start position of the tag closing (line and character) - byte positions 24-31 (8 bytes)
 * 4. End position of the tag closing (line and character) - byte positions 32-39 (8 bytes)
 * 5. Self-closing flag - byte position 40 (1 byte)
 * 6. Name length - byte positions 41-44 (4 bytes)
 * 7. Name bytes - byte positions 45-(45 + name length - 1) (name length bytes)
 * 8. Attributes block start position - byte positions 0-3 (4 bytes)
 * 9. Number of attributes - byte positions (attributes block start position)-(attributes block start position + 3) (4 bytes)
 * 10. Attribute data - variable length
 * 11. Text nodes block start position - byte positions 4-7 (4 bytes)
 * 12. Number of text nodes - byte positions (text nodes block start position)-(text nodes block start position + 3) (4 bytes)
 * 13. Text node data - variable length
 *
 * The `Tag` class decodes this data into its respective fields: `openStart`, `openEnd`, `closeStart`, `closeEnd`, `selfClosing`, `name`, `attributes`, and `textNodes`.
 *
 * # Fields
 *
 * * `openStart` - The start position of the tag opening.
 * * `openEnd` - The end position of the tag opening.
 * * `closeStart` - The start position of the tag closing.
 * * `closeEnd` - The end position of the tag closing.
 * * `selfClosing` - The self-closing flag of the tag.
 * * `name` - The name of the tag.
 * * `attributes` - The attributes of the tag.
 * * `textNodes` - The text nodes within the tag.
 *
 * # Arguments
 *
 * * `buffer` - The buffer containing the tag data.
 * * `ptr` - The initial pointer position.
 */
export declare class Tag extends Reader<Attribute[] | Text[] | Position | string | number | boolean> {
    /**
     * Gets the start position of the tag opening.
     *
     * @returns The start position of the tag opening.
     */
    get openStart(): Position;
    /**
     * Gets the end position of the tag opening.
     *
     * @returns The end position of the tag opening.
     */
    get openEnd(): Position;
    /**
     * Gets the start position of the tag closing.
     *
     * @returns The start position of the tag closing.
     */
    get closeStart(): Position;
    /**
     * Gets the end position of the tag closing.
     *
     * @returns The end position of the tag closing.
     */
    get closeEnd(): Position;
    /**
     * Gets the self-closing flag of the tag.
     *
     * @returns The self-closing flag of the tag.
     */
    get selfClosing(): boolean;
    /**
     * Gets the name of the tag.
     *
     * @returns The name of the tag.
     */
    get name(): string;
    /**
     * Gets the attributes of the tag.
     *
     * @returns An array of attributes of the tag.
     * @see Attribute
     */
    get attributes(): Attribute[];
    /**
     * Gets the text nodes within the tag.
     *
     * @returns An array of text nodes within the tag.
     * @see Text
     */
    get textNodes(): Text[];
    /**
     * Converts the tag to a JSON object.
     *
     * @returns A JSON object representing the tag.
     */
    toJSON(): {
        [p: string]: Attribute[] | Text[] | Position | string | number | boolean;
    };
    get value(): string;
}
interface WasmSaxParser extends WebAssembly.Exports {
    memory: WebAssembly.Memory;
    parser: (events: number) => void;
    write: (pointer: number, length: number) => void;
    end: () => void;
}
type TextDecoder = {
    decode: (input?: ArrayBufferView | ArrayBuffer, options?: {
        stream?: boolean;
    }) => string;
};
export declare class SAXParser {
    static textDecoder: TextDecoder;
    events?: number;
    wasmSaxParser?: WasmSaxParser;
    eventHandler?: (type: SaxEventType, detail: Detail) => void;
    private writeBuffer?;
    constructor(events?: number);
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
    parse(reader: ReadableStreamDefaultReader<Uint8Array>): AsyncGenerator<[SaxEventType, Detail]>;
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
    write(chunk: Uint8Array): void;
    /**
     * Ends the parsing process.
     *
     * This function signals the end of the parsing process notifies
     * the WASM binary to flush buffers and normalize.
     */
    end(): void;
    /**
     * Prepares the WebAssembly module for the SAX parser.
     *
     * This function takes a WebAssembly module source (either a `Response` or `Uint8Array`)
     * and instantiates it for use with the SAX parser.
     *
     * # Arguments
     *
     * * `source` - A `Response`, `Promise<Response>`, or `Uint8Array` representing the WebAssembly module source.
     *
     * # Returns
     *
     * * A `Promise<boolean>` that resolves to `true` if the WebAssembly module was successfully instantiated.
     *
     * # Examples
     *
     * ```ts
     * // Node.js example
     * import { SAXParser, SaxEventType } from 'sax-wasm';
     * import { readFileSync } from 'fs';
     * import { resolve as pathResolve } from 'path';
     *
     * (async () => {
     *   const parser = new SAXParser(SaxEventType.Text | SaxEventType.OpenTag);
     *   const wasmBuffer = readFileSync(pathResolve(__dirname + '/sax-wasm.wasm'));
     *   const success = await parser.prepareWasm(wasmBuffer);
     *   console.log('WASM prepared:', success);
     * })();
     *
     * // Browser example
     * import { SAXParser, SaxEventType } from 'sax-wasm';
     *
     * (async () => {
     *   const parser = new SAXParser(SaxEventType.Text | SaxEventType.OpenTag);
     *   const success = await parser.prepareWasm(fetch('path/to/your.wasm'));
     *   console.log('WASM prepared:', success);
     * })();
     * ```
     *
     * @param saxWasm Uint8Array contaning the WASM or a promise that will resolve to it.
     */
    prepareWasm(saxWasm: Response | Promise<Response>): Promise<boolean>;
    prepareWasm(saxWasm: Uint8Array): Promise<boolean>;
    /**
     * Internal event trap used to deliver the correct
     * reader for the bytes in the wasm memory based on
     * the envent type.
     *
     * @param event The SaxEventType emitted by the WASM
     * @param ptr The pointer to the memory location containing
     * the entity to read
     * @param len The length in bytes to read
     */
    eventTrap: (event: SaxEventType, ptr: number, len: number) => void;
}
export declare const readString: (data: Uint8Array, offset: number, length: number) => string;
export declare const readU32: (uint8Array: Uint8Array, ptr: number) => number;
export declare const readPosition: (uint8Array: Uint8Array, ptr?: number) => Position;
export {};
