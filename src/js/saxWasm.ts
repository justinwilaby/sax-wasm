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
export enum SaxEventType {
  // 1
  Text = 0b1,
  // 2
  ProcessingInstruction = 0b10,
  // 4
  Declaration = 0b100,
  // 8
  Doctype = 0b1000,
  // 16
  Comment = 0b10000,
  // 32
  OpenTagStart = 0b100000,
  // 64
  Attribute = 0b1000000,
  // 128
  OpenTag = 0b10000000,
  // 256
  CloseTag = 0b100000000,
  // 512
  Cdata = 0b1000000000,
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
export abstract class Reader<T = Detail> {
  protected cache = {} as { [prop: string]: T };
  protected dataView: Uint8Array

  /**
   * Creates a new Reader instance.
   *
   * @param data - The data buffer containing the event data.
   * @param ptr - The initial pointer position.
   * @param memory - The WebAssembly memory instance.
   */
  constructor(protected data: Uint8Array, protected memory: WebAssembly.Memory) {
    this.dataView = new Uint8Array(memory.buffer);
  }

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
  public abstract toBoxed(): void;

  /**
   * Converts the reader data to a JSON object.
   *
   * @returns A JSON object representing the reader data.
   */
  public abstract toJSON(): { [prop: string]: T };
}

/**
 * Class representing the line and character
 * integers for entities that are encountered
 * in the document.
 */
export class Position {
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
 * Represents the different types of attributes.
 */
export enum AttributeType {
  Normal = 0b00,
  JSX = 0b01,
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
export class Attribute extends Reader<Text | AttributeType> {
  public static LENGTH = 76 as const;

  public type: AttributeType;
  public name: Text;
  public value: Text;

  constructor(data: Uint8Array, memory: WebAssembly.Memory) {
    super(data, memory);
    this.name = new Text(new Uint8Array(data.buffer, data.byteOffset, Text.LENGTH), memory);
    this.value = new Text(new Uint8Array(data.buffer, data.byteOffset + Text.LENGTH, Text.LENGTH), memory);
    this.type = data[72];
  }

  /**
   * @inheritdoc
   */
  public toBoxed(): void {
    this.name.toBoxed();
    this.value.toBoxed();
    this.memory = undefined;
  }

  /**
   * @inheritDoc
   */
  public toJSON(): { [prop: string]: Text | AttributeType } {
    const { name, value, type } = this;
    return { name, value, type };
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
export class ProcInst extends Reader<Position | Text> {
  public static LENGTH = 88 as const;

  public target: Text;
  public content: Text;

  constructor(data: Uint8Array, memory: WebAssembly.Memory) {
    super(data, memory);

    this.target = new Text(new Uint8Array(data.buffer, data.byteOffset + 16, Text.LENGTH), memory);
    this.content = new Text(new Uint8Array(data.buffer, data.byteOffset + 16 + Text.LENGTH, Text.LENGTH), memory);
  }

  /**
   * @inheritdoc
   */
  public toBoxed(): void {
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
  public get start(): Position {
    return (
      (this.cache.start as Position) ||
      (this.cache.start = readPosition(this.data, 80))
    );
  }

  /**
   * Gets the start position of the processing instruction.
   *
   * @returns The start position of the processing instruction.
   */
  public get end(): Position {
    return (
      (this.cache.end as Position) ||
      (this.cache.end = readPosition(this.data, 8))
    );
  }

  /**
   * Converts the processing instruction to a JSON object.
   *
   * @returns A JSON object representing the processing instruction.
   */
  public toJSON(): { [p: string]: Position | Text } {
    const { start, end, target, content } = this;
    return { start, end, target, content };
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
export class Text extends Reader<string | Position> {
  public static LENGTH = 36 as const;
  /**
   * Gets the start position of the text node.
   *
   * @returns The start position of the text node.
   */
  public get start(): Position {
    return this.cache.start as Position || (this.cache.start = readPosition(this.data, 20));
  }

  /**
   * Gets the end position of the text node.
   *
   * @returns The end position of the text node.
   */
  public get end(): Position {
    return this.cache.end as Position || (this.cache.end = readPosition(this.data, 28));
  }

  /**
   * @inheritdoc
   */
  public toBoxed(): void {
    this.data = this.data.slice();
    // Build our data view and update the pointer
    const vecPtr = readU32(this.data, 12);
    const valueLen = readU32(this.data, 16);
    this.dataView = new Uint8Array(this.memory.buffer, vecPtr, valueLen).slice();
    this.data.set([0,0,0,0], 12); // Set the vecPtr to 0
    this.memory = undefined;
  }

  /**
   * Gets the value of the text node.
   *
   * @returns The value of the text node.
   */
  public get value(): string {
    if (this.cache.value) {
      return this.cache.value as string;
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
  public toJSON(): { [prop: string]: string | Position } {
    const { start, end, value } = this;
    return { start, end, value };
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
export class Tag extends Reader<Attribute[] | Text[] | Position | string | number | boolean> {
  public static LENGTH = 82 as const;

  /**
   * @inheritdoc
   */
  public toBoxed(): void {
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
  public get openStart(): Position {
    return (
      (this.cache.openStart as Position) ||
      (this.cache.openStart = readPosition(this.data, 40))
    );
  }
  /**
   * Gets the end position of the tag opening.
   *
   * @returns The end position of the tag opening.
   */
  public get openEnd(): Position {
    return (
      (this.cache.openEnd as Position) ||
      (this.cache.openEnd = readPosition(this.data, 48))
    );
  }
  /**
   * Gets the start position of the tag closing.
   *
   * @returns The start position of the tag closing.
   */
  public get closeStart(): Position {
    return (
      (this.cache.closeStart as Position) ||
      (this.cache.closeStart = readPosition(this.data, 56))
    );
  }

  /**
   * Gets the end position of the tag closing.
   *
   * @returns The end position of the tag closing.
   */
  public get closeEnd(): Position {
    return (
      (this.cache.closeEnd as Position) ||
      (this.cache.closeEnd = readPosition(this.data, 64))
    );
  }

  /**
   * Gets the self-closing flag of the tag.
   *
   * @returns The self-closing flag of the tag.
   */
  public get selfClosing(): boolean {
    return !!this.data[36];
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
  public get attributes(): Attribute[] {
    if (this.cache.attributes) {
      return this.cache.attributes as Attribute[];
    }
    // starting location of the attribute block
    let ptr = readU32(this.data, 16);
    const numAttrs = readU32(this.data, 20);

    const attributes = [] as Attribute[];
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
  public get textNodes(): Text[] {
    if (this.cache.textNodes) {
      return this.cache.textNodes as Text[];
    }
    // starting location of the text nodes block
    let ptr = readU32(this.data, 28);
    const numTextNodes = readU32(this.data, 32);
    const textNodes = [] as Text[];
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
  public toJSON(): {
    [p: string]: Attribute[] | Text[] | Position | string | number | boolean;
  } {
    const {
      openStart,
      openEnd,
      closeStart,
      closeEnd,
      name,
      attributes,
      textNodes,
      selfClosing,
    } = this;
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

  public get value() {
    return this.name;
  }
}

interface WasmSaxParser extends WebAssembly.Exports {
  memory: WebAssembly.Memory;
  parser: (events: number) => void;
  write: (pointer: number, length: number) => void;
  end: () => void;
}

type TextDecoder = {
  decode: (
    input?: ArrayBufferView | ArrayBuffer,
    options?: { stream?: boolean }
  ) => string;
};
export class SAXParser {
  public static textDecoder: TextDecoder; // Web only

  public events?: number;
  public wasmSaxParser?: WasmSaxParser;

  public eventHandler?: (type: SaxEventType, detail: Detail) => void;

  private createDetailConstructor<T extends { new(...args: any[]): {}; LENGTH: number }>(Constructor: T) {
    return (memoryBuffer: ArrayBuffer, ptr: number): Detail => {
      return new Constructor(new Uint8Array(memoryBuffer, ptr, Constructor.LENGTH), this.wasmSaxParser.memory) as Detail;
    };
  }

  private eventToDetailConstructor = new Map<SaxEventType, (memoryBuffer: ArrayBuffer, ptr: number) => Detail>([
    [SaxEventType.Attribute, this.createDetailConstructor(Attribute)],
    [SaxEventType.ProcessingInstruction, this.createDetailConstructor(ProcInst)],
    [SaxEventType.OpenTag, this.createDetailConstructor(Tag)],
    [SaxEventType.CloseTag, this.createDetailConstructor(Tag)],
    [SaxEventType.OpenTagStart, this.createDetailConstructor(Tag)],
    [SaxEventType.Text, this.createDetailConstructor(Text)],
    [SaxEventType.Cdata, this.createDetailConstructor(Text)],
    [SaxEventType.Comment, this.createDetailConstructor(Text)],
    [SaxEventType.Doctype, this.createDetailConstructor(Text)],
    [SaxEventType.Declaration, this.createDetailConstructor(Text)],
  ]);

  private writeBuffer?: Uint8Array;

  constructor(events = 0) {
    const self = this;
    Object.defineProperties(this, {
      events: {
        get: () => ~~events,
        set: (value: number) => {
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
  public async *parse(reader: ReadableStreamDefaultReader<Uint8Array>): AsyncGenerator<[SaxEventType, Detail]> {
    let eventAggregator: [SaxEventType, Detail][] | null = [];
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
  public write(chunk: Uint8Array): void {
    if (!this.wasmSaxParser) {
      return;
    }

    const { write, memory:{buffer} } = this.wasmSaxParser;

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
  public async prepareWasm(saxWasm: Uint8Array | Response | Promise<Response>): Promise<boolean> {
    let result: WebAssembly.WebAssemblyInstantiatedSource;
    const env = {
      memory: new WebAssembly.Memory({ initial: 10, shared: true, maximum: 150 } as WebAssembly.MemoryDescriptor),
      table: new WebAssembly.Table({ initial: 1, element: 'anyfunc' } as WebAssembly.TableDescriptor),
      event_listener: this.eventTrap
    };

    if (saxWasm instanceof Uint8Array) {
      result = await WebAssembly.instantiate(saxWasm, { env });
    } else {
      result = await WebAssembly.instantiateStreaming(saxWasm, { env });
    }

    if (result && typeof this.events === 'number') {
      const { parser } = this.wasmSaxParser = result.instance.exports as unknown as WasmSaxParser;
      parser(this.events);
      return true;
    }
    throw new Error(`Failed to instantiate the parser.`);
  }

  public eventTrap = (event: number, ptr: number): void => {
    if (!this.wasmSaxParser || !this.eventHandler) {
      return;
    }
    const memoryBuffer = this.wasmSaxParser.memory.buffer;
    let detail: Detail;

    const constructor = this.eventToDetailConstructor.get(event);
    if (constructor) {
      detail = constructor(memoryBuffer, ptr);
    } else {
      throw new Error("No reader for this event type");
    }

    this.eventHandler(event, detail);
  };
}

export const readString = (data: Uint8Array, offset: number, length: number): string => {
  // Node
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(data.buffer, data.byteOffset + offset, length).toString();
  }
  // Web
  return (
    SAXParser.textDecoder || (SAXParser.textDecoder = new TextDecoder())
  ).decode(data.subarray(offset, offset + length));
};

export const readU32 = (uint8Array: Uint8Array, ptr: number): number =>
  (uint8Array[ptr + 3] << 24) |
  (uint8Array[ptr + 2] << 16) |
  (uint8Array[ptr + 1] << 8) |
  uint8Array[ptr];

export const readPosition = (uint8Array: Uint8Array, ptr = 0): Position => {
  const line = readU32(uint8Array, ptr);
  const character = readU32(uint8Array, ptr + 4);
  return new Position(line, character);
};
