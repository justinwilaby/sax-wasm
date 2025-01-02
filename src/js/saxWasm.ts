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
export enum SaxEventType {
  // 1
  Text = 0b1,
  // 2
  ProcessingInstruction = 0b10,
  // 4
  SGMLDeclaration = 0b100,
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
  protected data: Uint8Array;
  protected cache = {} as { [prop: string]: T };
  protected ptr: number;

  /**
   * Creates a new Reader instance.
   *
   * @param data - The data to be read.
   * @param ptr - The initial pointer position.
   */
  constructor(data: Uint8Array, ptr = 0) {
    this.data = data;
    this.ptr = ptr;
  }

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
  public type: AttributeType;
  public name: Text;
  public value: Text;

  /**
   * Creates a new Attribute instance.
   *
   * @param buffer - The buffer containing the attribute data.
   * @param ptr - The initial pointer position.
   */
  constructor(buffer: Uint8Array, ptr = 0) {
    super(buffer, ptr);
    this.type = buffer[ptr];
    ptr += 1;
    const len = readU32(buffer, ptr);
    ptr += 4;
    this.name = new Text(buffer, ptr);
    ptr += len;
    this.value = new Text(buffer, ptr);
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
  public target: Text;
  public content: Text;

  /**
   * Creates a new ProcInst instance.
   *
   * @param buffer - The buffer containing the processing instruction data.
   * @param ptr - The initial pointer position.
   */
  constructor(buffer: Uint8Array, ptr = 0) {
    super(buffer, ptr);
    ptr += 16;
    const len = readU32(buffer, ptr);
    ptr += 4;
    this.target = new Text(buffer, ptr);
    ptr += len;
    this.content = new Text(buffer, ptr);
  }

  /**
   * Gets the start position of the processing instruction.
   *
   * @returns The start position of the processing instruction.
   */
  public get start(): Position {
    return (
      (this.cache.start as Position) ||
      (this.cache.start = readPosition(this.data, this.ptr))
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
      (this.cache.end = readPosition(this.data, this.ptr + 8))
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

  public toString(): string {
    const { target, content } = this;
    return `<? ${target} ${content} ?>`;
  }
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
export class Text extends Reader<string | Position> {
  /**
   * Gets the start position of the text node.
   *
   * @returns The start position of the text node.
   */
  public get start(): Position {
    return (
      (this.cache.start as Position) ||
      (this.cache.start = readPosition(this.data, this.ptr))
    );
  }

  /**
   * Gets the end position of the text node.
   *
   * @returns The end position of the text node.
   */
  public get end(): Position {
    return (
      (this.cache.end as Position) ||
      (this.cache.end = readPosition(this.data, this.ptr + 8))
    );
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
    const valueLen = readU32(this.data, this.ptr + 16);
    return (this.cache.value = readString(this.data, this.ptr + 20, valueLen));
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
export class Tag extends Reader<
  Attribute[] | Text[] | Position | string | number | boolean
> {
  /**
   * Gets the start position of the tag opening.
   *
   * @returns The start position of the tag opening.
   */
  public get openStart(): Position {
    return (
      (this.cache.openStart as Position) ||
      (this.cache.openStart = readPosition(this.data, this.ptr + 8))
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
      (this.cache.openEnd = readPosition(this.data, this.ptr + 16))
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
      (this.cache.closeStart = readPosition(this.data, this.ptr + 24))
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
      (this.cache.closeEnd = readPosition(this.data, this.ptr + 32))
    );
  }

  /**
   * Gets the self-closing flag of the tag.
   *
   * @returns The self-closing flag of the tag.
   */
  public get selfClosing(): boolean {
    return !!this.data[this.ptr + 40];
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
    const nameLen = readU32(this.data, this.ptr + 41);
    return (this.cache.name = readString(this.data, this.ptr + 45, nameLen));
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
    let ptr = readU32(this.data, this.ptr);
    const numAttrs = readU32(this.data, ptr);
    ptr += 4;
    const attributes = [] as Attribute[];
    for (let i = 0; i < numAttrs; i++) {
      const attrLen = readU32(this.data, ptr);
      ptr += 4;
      attributes[i] = new Attribute(this.data, ptr);
      ptr += attrLen;
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
    let ptr = readU32(this.data, this.ptr + 4);
    const numTextNodes = readU32(this.data, ptr);
    const textNodes = [] as Text[];
    ptr += 4;
    for (let i = 0; i < numTextNodes; i++) {
      const textLen = readU32(this.data, ptr);
      ptr += 4;
      textNodes[i] = new Text(this.data, ptr);
      ptr += textLen;
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
   * @param saxWasm Uint8Array contaning the WASM or a promise that will resolve to it.
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
  public eventTrap = (event: SaxEventType, ptr: number, len: number): void => {
    const uint8array = new Uint8Array(this.wasmSaxParser.memory.buffer, ptr, len).slice();

    let detail: Detail;
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
        throw new Error("No reader for this event type");
    }

    if (this.eventHandler) {
      this.eventHandler(event, detail);
    }
  };
}

export const readString = (data: Uint8Array, offset: number, length: number): string => {
  // Node
  if (globalThis.hasOwnProperty('Buffer')) {
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
