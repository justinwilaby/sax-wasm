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
    protected memory: WebAssembly.Memory;
    protected cache: {
        [prop: string]: T;
    };
    protected dataView: Uint8Array;
    /**
     * Creates a new Reader instance.
     *
     * @param data - The data buffer containing the event data.
     * @param ptr - The initial pointer position.
     * @param memory - The WebAssembly memory instance.
     */
    constructor(data: Uint8Array, memory: WebAssembly.Memory);
    /**
     * Internally copies a portion of the WebAssembly
     * memory that represents the reader source data to
     * guarantee that the data is not garbage collected
     * and all fields continue to be accessible after
     * the WASM write process has completed.
     *
     * Calling this method is not necessary if all
     * data is read inside the eventHandler callback
     * or the parse generator loop. However, if you
     * need to access the data outside of the callback
     * or pass it to an async function, calling this
     * method immediately is required.
     *
     * **Note** This method has a very small performance
     * cost and should be used judiciously on large documents.
     */
    abstract toBoxed(): void;
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
    static LENGTH: 76;
    type: AttributeType;
    name: Text;
    value: Text;
    constructor(data: Uint8Array, memory: WebAssembly.Memory);
    /**
     * @inheritdoc
     */
    toBoxed(): void;
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
    static LENGTH: 80;
    target: Text;
    content: Text;
    constructor(data: Uint8Array, memory: WebAssembly.Memory);
    /**
     * @inheritdoc
     */
    toBoxed(): void;
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
    /**
     * @inheritdoc
     */
    toString(): string;
}
/**
 * Represents a text node in the XML data.
 *
 * This class decodes the text node data sent across the FFI boundary
 * into its respective fields: `start`, `end`, and `value`.
 */
export declare class Text extends Reader<string | Position> {
    static LENGTH: 36;
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
     * @inheritdoc
     */
    toBoxed(): void;
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
 * This class decodes the tag data sent across the FFI boundary
 * into its respective fields: `openStart`, `openEnd`, `closeStart`,
 * `closeEnd`, `selfClosing`, `name`, `attributes`, and `textNodes`.
 */
export declare class Tag extends Reader<Attribute[] | Text[] | Position | string | number | boolean> {
    static LENGTH: 82;
    /**
     * @inheritdoc
     */
    toBoxed(): void;
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
    eventTrap: (event: number, ptr: number) => void;
}
export declare const readString: (data: Uint8Array, offset: number, length: number) => string;
export declare const readU32: (uint8Array: Uint8Array, ptr: number) => number;
export declare const readPosition: (uint8Array: Uint8Array, ptr?: number) => Position;
export {};
