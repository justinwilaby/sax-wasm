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
  /** Close notification with undefined detail; no Tag reader is constructed. */
  CloseTagSignal: 0b10000000000,
} as const;

export type SaxEventType = typeof SaxEventType[keyof typeof SaxEventType]

export type SaxEvent = [typeof SaxEventType.Text, Text]
  | [typeof SaxEventType.ProcessingInstruction, ProcInst]
  | [typeof SaxEventType.Declaration, Text]
  | [typeof SaxEventType.Doctype, Text]
  | [typeof SaxEventType.Comment, Text]
  | [typeof SaxEventType.OpenTagStart, Tag]
  | [typeof SaxEventType.Attribute, Attribute]
  | [typeof SaxEventType.OpenTag, Tag]
  | [typeof SaxEventType.CloseTag, Tag]
  | [typeof SaxEventType.CloseTagSignal, undefined]
  | [typeof SaxEventType.Cdata, Text]

/**
 * Represents the different types of attributes.
 */
export enum AttributeType {
  NoValue = 0b0000,
  JSX = 0b0001,
  NoQuotes = 0b0010,
  SingleQuoted = 0b0100,
  DoubleQuoted = 0b1000,
}

export type AttributeDetail = {
  readonly type: AttributeType;
  readonly name: TextDetail;
  readonly value: TextDetail;
  readonly byteOffsets: ByteOffsets;
}

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
}

export type ProcInstDetail = {
  readonly target: TextDetail;
  readonly content: TextDetail;
  readonly start: PositionDetail;
  readonly end: PositionDetail;
  readonly byteOffsets: ByteOffsets;
}

export type TextDetail = {
  readonly start: PositionDetail;
  readonly end: PositionDetail;
  readonly value: string;
  readonly byteOffsets: ByteOffsets;
}
export type PositionDetail = {
  readonly line: number;
  readonly character: number;
}
export type ByteOffsets = {
  start: number;
  end: number;
}
/**
 * Represents the detail of a SAX event.
 */
export type Detail = AttributeDetail | TextDetail | TagDetail | ProcInstDetail;

type MemoryViews = { buffer: ArrayBuffer; bytes: Uint8Array; view: DataView; shared: boolean };
const memoryViews = new WeakMap<WebAssembly.Memory, MemoryViews>();
const viewsFor = (memory: WebAssembly.Memory): MemoryViews => {
  let views = memoryViews.get(memory);
  if (!views || views.buffer.byteLength === 0 || (views.shared && views.buffer !== memory.buffer)) {
    const buffer = memory.buffer;
    views = { buffer, bytes: new Uint8Array(buffer), view: new DataView(buffer), shared: typeof SharedArrayBuffer !== 'undefined' && buffer instanceof SharedArrayBuffer };
    memoryViews.set(memory, views);
  }
  return views;
};

/** Abstract class for decoding SAX event data directly from linear memory. */
export abstract class Reader<T extends Detail = Detail> {
  protected cache = {} as Record<string, unknown>;
  protected pointer: number;
  private views: MemoryViews;

  private currentViews(): MemoryViews {
    if (this.views.buffer.byteLength === 0 || (this.views.shared && this.views.buffer !== this.memory.buffer)) {
      this.views = viewsFor(this.memory);
    }
    return this.views;
  }

  get dataView(): Uint8Array {
    return this.currentViews().bytes;
  }

  constructor(pointer: number, protected memory: WebAssembly.Memory) {
    if (typeof pointer !== 'number') {
      throw new TypeError('Event readers require a numeric Wasm memory pointer.');
    }
    this.pointer = pointer;
    this.views = viewsFor(memory);
  }

  protected readU32(offset: number): number {
    return this.currentViews().view.getUint32(this.pointer + offset, true);
  }

  protected readU64(offset: number): number {
    const view = this.currentViews().view;
    const ptr = this.pointer + offset;
    return view.getUint32(ptr, true) + view.getUint32(ptr + 4, true) * 0x1_0000_0000;
  }

  protected readPosition(offset: number): Position {
    const view = this.currentViews().view;
    const ptr = this.pointer + offset;
    return new Position(
      view.getUint32(ptr, true) + view.getUint32(ptr + 4, true) * 0x1_0000_0000,
      view.getUint32(ptr + 8, true) + view.getUint32(ptr + 12, true) * 0x1_0000_0000
    );
  }

  protected readByte(offset: number): number {
    return this.currentViews().bytes[this.pointer + offset];
  }

  /**
   * Converts the reader data to a JSON object.
   *
   * @returns A JSON object representing the reader data.
   */
  public abstract toJSON(): { [K in keyof T]: T[K] };
}

/**
 * Class representing the line and character
 * integers for entities that are encountered
 * in the document.
 */
export class Position implements PositionDetail {
  public line: number;
  public character: number;

  /**
   * Creates a new Position instance.
   *
   * @param line - The line number.
   * @param character - The character position.
   */
  constructor(line: number, character: number) {
    this.line = line;
    this.character = character;
  }
}

/**
 * Represents an attribute in the XML data.
 *
 * Decodes a version 1 descriptor: name Text at offset 0, value Text at
 * offset 56, type at 112, and byte offsets at 120 and 128.
 */
export class Attribute extends Reader<AttributeDetail> implements AttributeDetail {
  public static LENGTH = 136 as const;

  public type: AttributeType;

  public get name(): Text {
    return (this.cache.name ??= new Text(this.pointer, this.memory)) as Text;
  }

  public set name(value: Text) {
    this.cache.name = value;
  }

  public get value(): Text {
    return (this.cache.value ??= new Text(this.pointer + Text.LENGTH, this.memory)) as Text;
  }

  public set value(value: Text) {
    this.cache.value = value;
  }

  constructor(pointer: number, memory: WebAssembly.Memory) {
    super(pointer, memory);
    this.type = this.readByte(112);
  }

  /**
  * Gets the byte offsets representing the
  * start and end byte in the data
  */
  public get byteOffsets(): ByteOffsets {
    return (this.cache.byteOffsets ??= {
      start: this.readU64(120),
      end: this.readU64(128)
    }) as ByteOffsets;
  }

  /**
   * @inheritDoc
   */
  public toJSON() {
    const { name, value, type, byteOffsets } = this;
    return { name: name.toJSON(), value: value.toJSON(), type, byteOffsets };
  }

  /**
   * Converts the attribute to a string representation.
   *
   * @returns A string representing the attribute.
   */
  public toString(): string {
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
export class ProcInst extends Reader<ProcInstDetail> implements ProcInstDetail {
  public static LENGTH = 160 as const;

  public get target(): Text {
    return (this.cache.target ??= new Text(this.pointer + 32, this.memory)) as Text;
  }

  public set target(value: Text) {
    this.cache.target = value;
  }

  public get content(): Text {
    return (this.cache.content ??= new Text(this.pointer + 32 + Text.LENGTH, this.memory)) as Text;
  }

  public set content(value: Text) {
    this.cache.content = value;
  }

  /**
   * Gets the start position of the processing instruction.
   *
   * @returns The start position of the processing instruction.
   */
  public get start(): PositionDetail {
    return (
      (this.cache.start as PositionDetail) ||
      (this.cache.start = this.readPosition(0))
    );
  }

  /**
   * Gets the start position of the processing instruction.
   *
   * @returns The start position of the processing instruction.
   */
  public get end(): PositionDetail {
    return (
      (this.cache.end as PositionDetail) ||
      (this.cache.end = this.readPosition(16))
    );
  }

  /**
   * Gets the byte offsets representing the
   * start and end byte in the data
   */
  public get byteOffsets(): ByteOffsets {
    return (this.cache.byteOffsets ??= {
      start: this.readU64(144),
      end: this.readU64(152),
    }) as ByteOffsets;
  }

  /**
   * Converts the processing instruction to a JSON object.
   *
   * @returns A JSON object representing the processing instruction.
   */
  public toJSON() {
    const { start, end, target, content, byteOffsets } = this;
    return { start, end, target: target.toJSON(), content: content.toJSON(), byteOffsets };
  }

  /**
   * @inheritdoc
   */
  public toString(): string {
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
export class Text extends Reader<TextDetail> implements TextDetail {
  public static LENGTH = 56 as const;

  /**
   * Gets the start position of the text node.
   *
   * @returns The start position of the text node.
   */
  public get start(): PositionDetail {
    return this.cache.start as PositionDetail || (this.cache.start = this.readPosition(8));
  }

  /**
   * Gets the end position of the text node.
   *
   * @returns The end position of the text node.
   */
  public get end(): PositionDetail {
    return this.cache.end as PositionDetail || (this.cache.end = this.readPosition(24));
  }

  /**
   * Gets the value of the text node.
   *
   * @returns The value of the text node.
   */
  public get value(): string {
    if (this.cache.value !== undefined) {
      return this.cache.value as string;
    }
    const vecPtr = this.readU32(0);
    const valueLen = this.readU32(4);
    return (this.cache.value = readString(this.dataView, vecPtr, valueLen));
  }

  /**
  * Gets the byte offsets representing the
  * start and end byte in the data
  */
  public get byteOffsets(): ByteOffsets {
    return (this.cache.byteOffsets ??= {
      start: this.readU64(40),
      end: this.readU64(48)
    }) as ByteOffsets;
  }

  /**
   * Converts the text node to a JSON object.
   *
   * @returns A JSON object representing the text node.
   */
  public toJSON() {
    const { start, end, value, byteOffsets } = this;
    return { start, end, value, byteOffsets };
  }

  /**
   * Converts the text node to a string representation.
   *
   * @returns A string representing the text node.
   */
  public toString(): string {
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
export class Tag extends Reader<TagDetail> implements TagDetail {
  public static LENGTH = 112 as const;

  /**
   * Gets the start position of the tag opening.
   *
   * @returns The start position of the tag opening.
   */
  public get openStart(): PositionDetail {
    return (
      (this.cache.openStart as PositionDetail) ||
      (this.cache.openStart = this.readPosition(32))
    );
  }
  /**
   * Gets the end position of the tag opening.
   *
   * @returns The end position of the tag opening.
   */
  public get openEnd(): PositionDetail {
    return (
      (this.cache.openEnd as PositionDetail) ||
      (this.cache.openEnd = this.readPosition(48))
    );
  }
  /**
   * Gets the start position of the tag closing.
   *
   * @returns The start position of the tag closing.
   */
  public get closeStart(): PositionDetail {
    return (
      (this.cache.closeStart as PositionDetail) ||
      (this.cache.closeStart = this.readPosition(64))
    );
  }

  /**
   * Gets the end position of the tag closing.
   *
   * @returns The end position of the tag closing.
   */
  public get closeEnd(): PositionDetail {
    return (
      (this.cache.closeEnd as PositionDetail) ||
      (this.cache.closeEnd = this.readPosition(80))
    );
  }

  /**
   * Gets the self-closing flag of the tag.
   *
   * @returns The self-closing flag of the tag.
   */
  public get selfClosing(): boolean {
    return !!this.readByte(24);
  }

  /**
   * Gets the name of the tag.
   *
   * @returns The name of the tag.
   */
  public get name(): string {
    if (this.cache.name) {
      return this.cache.name as string;
    }
    const vecPtr = this.readU32(0);
    const valueLen = this.readU32(4);
    return (this.cache.name = readString(this.dataView, vecPtr, valueLen));
  }

  /**
   * Gets the attributes of the tag.
   *
   * @returns An array of attributes of the tag.
   * @see Attribute
   */
  public get attributes(): Attribute[] {
    if (this.cache.attributes) {
      return this.cache.attributes as Attribute[];
    }
    // starting location of the attribute block
    let ptr = this.readU32(8);
    const numAttrs = this.readU32(12);

    const attributes = [] as Attribute[];
    for (let i = 0; i < numAttrs; i++) {
      attributes[i] = new Attribute(ptr, this.memory);
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
  public get textNodes(): Text[] {
    if (this.cache.textNodes) {
      return this.cache.textNodes as Text[];
    }
    // starting location of the text nodes block
    let ptr = this.readU32(16);
    const numTextNodes = this.readU32(20);
    const textNodes = [] as Text[];
    for (let i = 0; i < numTextNodes; i++) {
      textNodes[i] = new Text(ptr, this.memory);
      ptr += Text.LENGTH;
    }
    return (this.cache.textNodes = textNodes);
  }

  /**
  * Gets the byte offsets representing the
  * start and end byte in the data
  */
  public get byteOffsets(): ByteOffsets {
    return (this.cache.byteOffsets ??= {
      start: this.readU64(96),
      end: this.readU64(104)
    }) as ByteOffsets;
  }

  /**
   * Converts the tag to a JSON object.
   *
   * @returns A JSON object representing the tag.
   */
  public toJSON() {
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

  public get value() {
    return this.name;
  }
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
  decode: (
    input?: ArrayBufferView | ArrayBuffer,
    options?: { stream?: boolean }
  ) => string;
};
export class SAXParser {
  public static textDecoder: TextDecoder = new TextDecoder();

  public events?: number;
  public wasmSaxParser?: WasmSaxParser;

  public eventHandler?: <T extends SaxEvent>(type: T[0], detail: T[1]) => void;

  private createDetailConstructor<T extends {
    new(pointer: number, memory: WebAssembly.Memory): Reader<Detail>;
    LENGTH: number;
  }>(Constructor: T) {
    return (ptr: number): Reader => {
      return new Constructor(ptr, this.wasmSaxParser!.memory);
    };
  }

  private eventConstructors: Array<((ptr: number) => Reader<Detail>) | undefined> = [];

  private writeBuffer?: Uint8Array;

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
        set: (value: number) => {
          if (events === ~~value) {
            return;
          }
          const next = ~~value;
          if (self.wasmSaxParser) {
            if ((next & SaxEventType.CloseTagSignal) && self.wasmSaxParser.close_tag_signal_version?.() !== 1) {
              throw new Error("WASM does not support CloseTagSignal");
            }
            self.wasmSaxParser.parser(next);
          }
          events = next;
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
  public async *parse(reader: ReadableStreamDefaultReader<Uint8Array>): AsyncGenerator<SaxEvent> {
    let eventAggregator: SaxEvent[] = [];
    this.eventHandler = function <T extends SaxEvent>(event: T[0], detail: T[1]) {
      eventAggregator.push([event, detail] as T);
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
  public write(chunk: Uint8Array): void {
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
  public end(): void {
    this.writeBuffer = undefined;
    this.wasmSaxParser?.end();
  }

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
  public async prepareWasm(saxWasm: Response | Promise<Response>): Promise<boolean>;
  public async prepareWasm(saxWasm: Uint8Array): Promise<boolean>;
  public async prepareWasm(saxWasm: WebAssembly.Module): Promise<boolean>;
  public async prepareWasm(saxWasm: Uint8Array | WebAssembly.Module | Response | Promise<Response>): Promise<boolean> {
    const env = {
      memory: new WebAssembly.Memory({ initial: 10, shared: true, maximum: 150 } as WebAssembly.MemoryDescriptor),
      table: new WebAssembly.Table({ initial: 1, element: 'anyfunc' } as WebAssembly.TableDescriptor),
      event_listener_v1: this.eventTrap
    };

    let instance: WebAssembly.Instance;
    if (saxWasm instanceof Uint8Array) {
      const result = await WebAssembly.instantiate(saxWasm.buffer as ArrayBuffer, { env });
      instance = result?.instance;
    } else if (saxWasm instanceof WebAssembly.Module) {
      instance = await WebAssembly.instantiate(saxWasm, { env });
    } else {
      const result = await WebAssembly.instantiateStreaming(saxWasm, { env });
      instance = result?.instance;
    }
    if (instance && typeof this.events === 'number') {
      const exports = instance.exports as unknown as WasmSaxParser;
      const abi = exports.event_abi_version?.();
      if (abi !== 1) {
        throw new Error(`Unsupported SAX event ABI version: ${abi ?? 'missing'}; expected 1.`);
      }
      if ((this.events & SaxEventType.CloseTagSignal) && exports.close_tag_signal_version?.() !== 1) {
        throw new Error("WASM does not support CloseTagSignal");
      }
      this.wasmSaxParser = exports;
      exports.parser(this.events);
      return true;
    }
    throw new Error(`Failed to instantiate the parser.`);
  }

  public eventTrap = (event: SaxEventType, ptr: number): void => {
    if (!this.wasmSaxParser || !this.eventHandler) {
      return;
    }
    // Signals have no descriptor; do not construct a Reader for the null pointer.
    if (event === SaxEventType.CloseTagSignal) {
      this.eventHandler(event, undefined);
      return;
    }
    let detail: Attribute | Text | Tag | ProcInst;

    const ctor = this.eventConstructors[event];
    if (ctor) {
      detail = ctor(ptr) as Attribute | Text | Tag | ProcInst
    } else {
      throw new Error("No reader for this event type");
    }

    this.eventHandler(event, detail);
  };
}

export const readString = (data: Uint8Array, offset: number, length: number): string => SAXParser.textDecoder.decode(data.subarray(offset, offset + length));

let cachedDataBuffer: ArrayBuffer | SharedArrayBuffer | null = null;
let cachedDataView: DataView | null = null;
const dataViewFor = (array: Uint8Array): DataView => {
  const buffer = array.buffer;
  if (buffer !== cachedDataBuffer) {
    cachedDataBuffer = buffer;
    cachedDataView = new DataView(buffer);
  }
  return cachedDataView!;
};

export const readU32 = (uint8Array: Uint8Array, ptr: number): number => {
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
function readU64(uint8Array: Uint8Array, ptr = 0): number {
  const view = dataViewFor(uint8Array);
  const lo = view.getUint32(uint8Array.byteOffset + ptr, true);
  const hi = view.getUint32(uint8Array.byteOffset + ptr + 4, true);
  return lo + hi * 0x1_0000_0000;
}

export const readPosition = (uint8Array: Uint8Array, ptr = 0): Position => {
  const line = readU64(uint8Array, ptr);
  const character = readU64(uint8Array, ptr + 8);
  return new Position(line, character);
};
