export class SaxEventType {
  // 1
  public static Text = 0b1;
  // 2
  public static ProcessingInstruction = 0b10;
  // 4
  public static SGMLDeclaration = 0b100;
  // 8
  public static Doctype = 0b1000;
  // 16
  public static Comment = 0b10000;
  // 32
  public static OpenTagStart = 0b100000;
  // 64
  public static Attribute = 0b1000000;
  // 128
  public static OpenTag = 0b10000000;
  // 256
  public static CloseTag = 0b100000000;
  // 512
  public static Cdata = 0b1000000000;
}

export type Detail = Position | Attribute | Text | Tag | ProcInst;

export abstract class Reader<T = Detail> {
  protected data: Uint8Array;
  protected cache = {} as { [prop: string]: T };
  protected ptr: number;

  constructor(data: Uint8Array, ptr = 0) {
    this.data = data;
    this.ptr = ptr;
  }

  public abstract toJSON(): { [prop: string]: T };
}

export class Position {
  public line: number;
  public character: number;

  constructor(line: number, character: number) {
    this.line = line;
    this.character = character;
  }
}

export enum AttributeType {
  Normal = 0b00,
  JSX = 0b01,
}

export class Attribute extends Reader<Text | AttributeType> {
  public type: AttributeType;
  public name: Text;
  public value: Text;

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

  public toJSON(): { [prop: string]: Text | AttributeType } {
    const {name, value, type} = this;
    return {name, value, type};
  }

  public toString(): string {
    const {name, value} = this;
    return `${ name }="${ value }"`;
  }
}

export class ProcInst extends Reader<Position | Text> {
  public target: Text;
  public content: Text;

  constructor(buffer: Uint8Array, ptr = 0) {
    super(buffer, ptr);
    ptr += 16;
    const len = readU32(buffer, ptr);
    ptr += 4;
    this.target = new Text(buffer, ptr);
    ptr += len;
    this.content = new Text(buffer, ptr);
  }

  public get start(): Position {
    return this.cache.start as Position || (this.cache.start = readPosition(this.data, this.ptr));
  }

  public get end(): Position {
    return this.cache.end as Position || (this.cache.end = readPosition(this.data, this.ptr + 8));
  }

  public toJSON(): { [p: string]: Position | Text } {
    const {start, end, target, content} = this;
    return {start, end, target, content};
  }

  public toString(): string {
    const {target, content} = this;
    return `<? ${ target } ${ content } ?>`;
  }
}

export class Text extends Reader<string | Position> {
  public get start(): Position {
    return this.cache.start as Position || (this.cache.start = readPosition(this.data, this.ptr));
  }

  public get end(): Position {
    return this.cache.end as Position || (this.cache.end = readPosition(this.data, this.ptr + 8));
  }

  public get value(): string {
    if (this.cache.value) {
      return this.cache.value as string;
    }
    const valueLen = readU32(this.data, this.ptr + 16);
    return (this.cache.value = readString(this.data, this.ptr + 20, valueLen));
  }

  public toJSON(): { [prop: string]: string | Position } {
    const {start, end, value} = this;
    return {start, end, value};
  }

  public toString(): string {
    return this.value;
  }
}

export class Tag extends Reader<Attribute[] | Text[] | Position | string | number | boolean> {
  public get openStart(): Position {
    return this.cache.openStart as Position || (this.cache.openStart = readPosition(this.data, this.ptr + 8));
  }

  public get openEnd(): Position {
    return this.cache.openEnd as Position || (this.cache.openEnd = readPosition(this.data, this.ptr + 16));
  }

  public get closeStart(): Position {
    return this.cache.closeStart as Position || (this.cache.closeStart = readPosition(this.data, this.ptr + 24));
  }

  public get closeEnd(): Position {
    return this.cache.closeEnd as Position || (this.cache.closeEnd = readPosition(this.data, this.ptr + 32));
  }

  public get selfClosing(): boolean {
    return !!this.data[this.ptr + 40];
  }

  public get name(): string {
    if (this.cache.name) {
      return this.cache.name as string;
    }
    const nameLen = readU32(this.data, this.ptr + 41);
    return (this.cache.name = readString(this.data, this.ptr + 45, nameLen));
  }

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

  public toJSON(): { [p: string]: Attribute[] | Text[] | Position | string | number | boolean } {
    const {openStart, openEnd, closeStart, closeEnd, name, attributes, textNodes, selfClosing} = this;
    return {openStart, openEnd, closeStart, closeEnd, name, attributes, textNodes, selfClosing};
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

export interface SaxParserOptions {
  highWaterMark: number;
}

type TextDecoder = { decode: (input?: ArrayBufferView | ArrayBuffer, options?: { stream?: boolean }) => string };

export class SAXParser {
  public static textDecoder: TextDecoder; // Web only

  public events?: number;
  public wasmSaxParser?: WasmSaxParser;

  public eventHandler?: (type: SaxEventType, detail: Detail) => void;
  private readonly options: SaxParserOptions;
  private writeBuffer?: Uint8Array;

  constructor(events = 0, options: SaxParserOptions = {highWaterMark: 32 * 1024}) {
    this.options = options;
    const self = this;
    Object.defineProperties(this, {
      events: {
        get: () => ~~events,
        set: (value: number) => {
          events = ~~value;
          if (self.wasmSaxParser) {
            self.wasmSaxParser.parser(events);
          }
        }, configurable: false, enumerable: true
      }
    });
  }

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

  public end(): void {
    this.writeBuffer = undefined;
    this.wasmSaxParser?.end();
  }

  public async prepareWasm(source: Response | Promise<Response>): Promise<boolean>;
  public async prepareWasm(saxWasm: Uint8Array): Promise<boolean>;
  public async prepareWasm(saxWasm: Uint8Array | Response | Promise<Response>): Promise<boolean> {
    let result: WebAssembly.WebAssemblyInstantiatedSource;
    if (saxWasm instanceof Uint8Array) {
      result = await WebAssembly.instantiate(saxWasm, {
        env: {
          memoryBase: 0,
          tableBase: 0,
          memory: new WebAssembly.Memory({initial: 10} as WebAssembly.MemoryDescriptor),
          table: new WebAssembly.Table({initial: 1, element: 'anyfunc'} as WebAssembly.TableDescriptor),
          event_listener: this.eventTrap
        }
      });
    } else {
      result = await WebAssembly.instantiateStreaming(saxWasm);
    }

    if (result && typeof this.events === 'number') {
      const {parser} = this.wasmSaxParser = result.instance.exports as unknown as WasmSaxParser;
      parser(this.events);
      return true;
    }
    throw new Error(`Failed to instantiate the parser.`);
  }

  public eventTrap = (event: number, ptr: number, len: number): void => {
    if (!this.wasmSaxParser) {
      return;
    }

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
        throw new Error('No reader for this event type');
    }

    if (this.eventHandler) {
        this.eventHandler(event, detail);
    }
  };
}

const readString = (data: Uint8Array, offset: number, length: number): string => {
  // Node
  if (globalThis.hasOwnProperty('Buffer')) {
    return Buffer.from(data.buffer, data.byteOffset + offset, length).toString();
  }
  // Web
  return (SAXParser.textDecoder || (SAXParser.textDecoder = new TextDecoder()))
    .decode(data.subarray(offset, offset + length));
};

const readU32 = (uint8Array: Uint8Array, ptr: number): number =>
  (uint8Array[ptr + 3] << 24) | (uint8Array[ptr + 2] << 16) | (uint8Array[ptr + 1] << 8) | uint8Array[ptr];

const readPosition = (uint8Array: Uint8Array, ptr: number = 0): Position => {
  const line = readU32(uint8Array, ptr);
  const character = readU32(uint8Array, ptr + 4);
  return new Position(line, character);
};
