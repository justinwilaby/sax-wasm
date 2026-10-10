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
export declare const SaxEventType: {
    readonly Text: 1;
    readonly ProcessingInstruction: 2;
    readonly Declaration: 4;
    readonly Doctype: 8;
    readonly Comment: 16;
    readonly OpenTagStart: 32;
    readonly Attribute: 64;
    readonly OpenTag: 128;
    readonly CloseTag: 256;
    readonly Cdata: 512;
    /** Close notification with undefined detail; no Tag reader is constructed. */
    readonly CloseTagSignal: 1024;
};
export type SaxEventType = typeof SaxEventType[keyof typeof SaxEventType];
export type SaxEvent = [typeof SaxEventType.Text, Text] | [typeof SaxEventType.ProcessingInstruction, ProcInst] | [typeof SaxEventType.Declaration, Text] | [typeof SaxEventType.Doctype, Text] | [typeof SaxEventType.Comment, Text] | [typeof SaxEventType.OpenTagStart, Tag] | [typeof SaxEventType.Attribute, Attribute] | [typeof SaxEventType.OpenTag, Tag] | [typeof SaxEventType.CloseTag, Tag] | [typeof SaxEventType.CloseTagSignal, undefined] | [typeof SaxEventType.Cdata, Text];
/**
 * Represents the different types of attributes.
 */
export declare enum AttributeType {
    NoValue = 0,
    JSX = 1,
    NoQuotes = 2,
    SingleQuoted = 4,
    DoubleQuoted = 8
}
export type AttributeDetail = {
    readonly type: AttributeType;
    readonly name: TextDetail;
    readonly value: TextDetail;
    readonly byteOffsets: ByteOffsets;
};
export type TagDetail = {
    readonly textNodes: TextDetail[];
    readonly attributes: AttributeDetail[];
    readonly openStart: PositionDetail;
    readonly openEnd: PositionDetail;
    readonly closeStart: PositionDetail;
    readonly closeEnd: PositionDetail;
    readonly name: string;
    readonly selfClosing: boolean;
    readonly byteOffsets: ByteOffsets;
};
export type ProcInstDetail = {
    readonly target: TextDetail;
    readonly content: TextDetail;
    readonly start: PositionDetail;
    readonly end: PositionDetail;
    readonly byteOffsets: ByteOffsets;
};
export type TextDetail = {
    readonly start: PositionDetail;
    readonly end: PositionDetail;
    readonly value: string;
    readonly byteOffsets: ByteOffsets;
};
export type PositionDetail = {
    readonly line: number;
    readonly character: number;
};
export type ByteOffsets = {
    start: number;
    end: number;
};
/**
 * Represents the detail of a SAX event.
 */
export type Detail = AttributeDetail | TextDetail | TagDetail | ProcInstDetail;
/** Abstract class for decoding SAX event data directly from linear memory. */
export declare abstract class Reader<T extends Detail = Detail> {
    protected memory: WebAssembly.Memory;
    protected cache: Record<string, unknown>;
    protected pointer: number;
    private views;
    private currentViews;
    get dataView(): Uint8Array;
    constructor(pointer: number, memory: WebAssembly.Memory);
    protected readU32(offset: number): number;
    protected readU64(offset: number): number;
    protected readPosition(offset: number): Position;
    protected readByte(offset: number): number;
    /**
     * Converts the reader data to a JSON object.
     *
     * @returns A JSON object representing the reader data.
     */
    abstract toJSON(): {
        [K in keyof T]: T[K];
    };
}
/**
 * Class representing the line and character
 * integers for entities that are encountered
 * in the document.
 */
export declare class Position implements PositionDetail {
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
 * Represents an attribute in the XML data.
 *
 * Decodes a version 1 descriptor: name Text at offset 0, value Text at
 * offset 56, type at 112, and byte offsets at 120 and 128.
 */
export declare class Attribute extends Reader<AttributeDetail> implements AttributeDetail {
    static LENGTH: 136;
    type: AttributeType;
    get name(): Text;
    set name(value: Text);
    get value(): Text;
    set value(value: Text);
    constructor(pointer: number, memory: WebAssembly.Memory);
    /**
    * Gets the byte offsets representing the
    * start and end byte in the data
    */
    get byteOffsets(): ByteOffsets;
    /**
     * @inheritDoc
     */
    toJSON(): {
        name: {
            start: PositionDetail;
            end: PositionDetail;
            value: string;
            byteOffsets: ByteOffsets;
        };
        value: {
            start: PositionDetail;
            end: PositionDetail;
            value: string;
            byteOffsets: ByteOffsets;
        };
        type: AttributeType;
        byteOffsets: ByteOffsets;
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
 * Its version 1 descriptor contains start/end positions at offsets 0/16,
 * target/content Text descriptors at 32/88, and byte offsets at 144/152.
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
 * * `pointer` - The descriptor's numeric offset into Wasm memory.
 * * `memory` - The Wasm memory containing the descriptor and its strings.
 */
export declare class ProcInst extends Reader<ProcInstDetail> implements ProcInstDetail {
    static LENGTH: 160;
    get target(): Text;
    set target(value: Text);
    get content(): Text;
    set content(value: Text);
    /**
     * Gets the start position of the processing instruction.
     *
     * @returns The start position of the processing instruction.
     */
    get start(): PositionDetail;
    /**
     * Gets the start position of the processing instruction.
     *
     * @returns The start position of the processing instruction.
     */
    get end(): PositionDetail;
    /**
     * Gets the byte offsets representing the
     * start and end byte in the data
     */
    get byteOffsets(): ByteOffsets;
    /**
     * Converts the processing instruction to a JSON object.
     *
     * @returns A JSON object representing the processing instruction.
     */
    toJSON(): {
        start: PositionDetail;
        end: PositionDetail;
        target: {
            start: PositionDetail;
            end: PositionDetail;
            value: string;
            byteOffsets: ByteOffsets;
        };
        content: {
            start: PositionDetail;
            end: PositionDetail;
            value: string;
            byteOffsets: ByteOffsets;
        };
        byteOffsets: ByteOffsets;
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
export declare class Text extends Reader<TextDetail> implements TextDetail {
    static LENGTH: 56;
    /**
     * Gets the start position of the text node.
     *
     * @returns The start position of the text node.
     */
    get start(): PositionDetail;
    /**
     * Gets the end position of the text node.
     *
     * @returns The end position of the text node.
     */
    get end(): PositionDetail;
    /**
     * Gets the value of the text node.
     *
     * @returns The value of the text node.
     */
    get value(): string;
    /**
    * Gets the byte offsets representing the
    * start and end byte in the data
    */
    get byteOffsets(): ByteOffsets;
    /**
     * Converts the text node to a JSON object.
     *
     * @returns A JSON object representing the text node.
     */
    toJSON(): {
        start: PositionDetail;
        end: PositionDetail;
        value: string;
        byteOffsets: ByteOffsets;
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
export declare class Tag extends Reader<TagDetail> implements TagDetail {
    static LENGTH: 112;
    /**
     * Gets the start position of the tag opening.
     *
     * @returns The start position of the tag opening.
     */
    get openStart(): PositionDetail;
    /**
     * Gets the end position of the tag opening.
     *
     * @returns The end position of the tag opening.
     */
    get openEnd(): PositionDetail;
    /**
     * Gets the start position of the tag closing.
     *
     * @returns The start position of the tag closing.
     */
    get closeStart(): PositionDetail;
    /**
     * Gets the end position of the tag closing.
     *
     * @returns The end position of the tag closing.
     */
    get closeEnd(): PositionDetail;
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
    * Gets the byte offsets representing the
    * start and end byte in the data
    */
    get byteOffsets(): ByteOffsets;
    /**
     * Converts the tag to a JSON object.
     *
     * @returns A JSON object representing the tag.
     */
    toJSON(): {
        openStart: PositionDetail;
        openEnd: PositionDetail;
        closeStart: PositionDetail;
        closeEnd: PositionDetail;
        name: string;
        attributes: {
            name: {
                start: PositionDetail;
                end: PositionDetail;
                value: string;
                byteOffsets: ByteOffsets;
            };
            value: {
                start: PositionDetail;
                end: PositionDetail;
                value: string;
                byteOffsets: ByteOffsets;
            };
            type: AttributeType;
            byteOffsets: ByteOffsets;
        }[];
        textNodes: {
            start: PositionDetail;
            end: PositionDetail;
            value: string;
            byteOffsets: ByteOffsets;
        }[];
        selfClosing: boolean;
        byteOffsets: ByteOffsets;
    };
    get value(): string;
}
interface WasmSaxParser extends WebAssembly.Exports {
    memory: WebAssembly.Memory;
    parser: (events: number) => void;
    close_tag_signal_version: () => number;
    write: (pointer: number, length: number) => void;
    end: () => void;
    event_abi_version: () => number;
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
    eventHandler?: <T extends SaxEvent>(type: T[0], detail: T[1]) => void;
    private createDetailConstructor;
    private eventConstructors;
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
    parse(reader: ReadableStreamDefaultReader<Uint8Array>): AsyncGenerator<SaxEvent>;
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
     * @param saxWasm Uint8Array containing the WASM or a promise that will resolve to it.
     */
    prepareWasm(saxWasm: Response | Promise<Response>): Promise<boolean>;
    prepareWasm(saxWasm: Uint8Array): Promise<boolean>;
    prepareWasm(saxWasm: WebAssembly.Module): Promise<boolean>;
    eventTrap: (event: SaxEventType, ptr: number) => void;
}
export declare const readString: (data: Uint8Array, offset: number, length: number) => string;
export declare const readU32: (uint8Array: Uint8Array, ptr: number) => number;
export declare const readPosition: (uint8Array: Uint8Array, ptr?: number) => Position;
export {};
