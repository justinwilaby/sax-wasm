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
  public static OpenCDATA = 0b1000000000;
  // 1024
  public static Cdata = 0b10000000000;
  // 2048
  public static CloseCDATA = 0b100000000000;
}

abstract class Reader<T> {
  constructor(uint8Array: Uint8Array, ptr: number = 0) {
    this.read(uint8Array, ptr);
  }

  protected abstract read(uint8Array: Uint8Array, ptr: number): void;
}

export class Position {
  public line: number;
  public character: number;

  constructor(line: number, character: number) {
    this.line = line;
    this.character = character;
  }
}

export class Attribute extends Reader<string | number | Position> {
  public static BYTES_IN_DESCRIPTOR = 48;

  public nameEnd: Position;
  public nameStart: Position;
  public valueEnd: Position;
  public valueStart: Position;
  public name: string;
  public value: string;

  protected read(uint8Array: Uint8Array, ptr: number): void {
    const namePtr = readU32(uint8Array, ptr);
    const nameLen = readU32(uint8Array, ptr + 4);
    this.name = readString(uint8Array.buffer, namePtr, nameLen);

    this.nameEnd = readPosition(uint8Array, ptr + 8);
    this.nameStart = readPosition(uint8Array, ptr + 16);

    const valuePtr = readU32(uint8Array, ptr + 24);
    const valueLen = readU32(uint8Array, ptr + 28);
    this.value = readString(uint8Array.buffer, valuePtr, valueLen);

    this.valueEnd = readPosition(uint8Array, ptr + 32);
    this.valueStart = readPosition(uint8Array, ptr + 40);
  }
}

export class Text extends Reader<string | Position> {
  public static BYTES_IN_DESCRIPTOR = 24;

  public end: Position;
  public start: Position;
  public value: string;

  protected read(uint8Array: Uint8Array, ptr: number): void {
    const valuePtr = readU32(uint8Array, ptr + 16);
    const valueLen = readU32(uint8Array, ptr + 20);

    this.end = readPosition(uint8Array, ptr);
    this.start = readPosition(uint8Array, ptr + 8);
    this.value = readString(uint8Array.buffer, valuePtr, valueLen);
  }
}

export class Tag extends Reader<Attribute[] | Text[] | Position | string | number | boolean> {
  public name: string;
  public attributes: Attribute[];
  public textNodes: Text[];
  public selfClosing: boolean;
  public openStart: Position;
  public openEnd: Position;
  public closeStart: Position;
  public closeEnd: Position;

  protected read(uint8Array: Uint8Array, ptr: number): void {
    this.closeEnd = readPosition(uint8Array, ptr);
    this.closeStart = readPosition(uint8Array, ptr + 8);
    this.openEnd = readPosition(uint8Array, ptr + 16);
    this.openStart = readPosition(uint8Array, ptr + 24);

    const namePtr = readU32(uint8Array,ptr + 32);
    const nameLen = readU32(uint8Array, ptr + 36);
    this.name = readString(uint8Array.buffer, namePtr, nameLen);

    this.selfClosing = !!uint8Array[ptr + 40];

    let offset = ptr + 41;
    const attributes = [] as Attribute[];
    let numAttrs = readU32(uint8Array, offset);
    offset += 4;
    for (let i = 0; i < numAttrs; i++) {
      attributes[i] = new Attribute(uint8Array, offset);
      offset += Attribute.BYTES_IN_DESCRIPTOR;
    }
    this.attributes = attributes;

    const textNodes = [] as Text[];
    let numNodes = uint8Array[offset];
    offset += 4;
    for (let i = 0; i < numNodes; i++) {
      textNodes[i] = new Text(uint8Array, offset);
      offset += Text.BYTES_IN_DESCRIPTOR;
    }
    this.textNodes = textNodes;
  }
}

interface WasmSaxParser {
  memory: WebAssembly.Memory;
  parser: (events: number) => void;
  write: (pointer: number, length: number) => void;
  end: () => void;
}

export interface SaxParserOptions {
  highWaterMark: number
}

export class SAXParser {
  public static textDecoder: TextDecoder; // Web only
  public static textEncoder: TextEncoder; // web only

  public events: number;
  public eventHandler: (type: SaxEventType, detail: Reader<any> | Position | string) => void;

  private readonly options: SaxParserOptions;
  private wasmSaxParser: WasmSaxParser;
  private writeBuffer: Uint8Array;
  private readBuffer: Uint8Array;

  constructor(events = 0, options: SaxParserOptions = { highWaterMark: 64 * 1024 }) {
    this.options = options;
    const self = this;
    Object.defineProperties(this, {
      events: {
        get: function () {
          return ~~events;
        },
        set: function (value: number) {
          events = ~~value;
          if (self.wasmSaxParser) {
            self.wasmSaxParser.parser(events);
          }
        }, configurable: false, enumerable: true
      }
    });
  }

  public write(slice: Uint8Array, offset: number = 0): void {
    const { write } = this.wasmSaxParser;
    if (!this.writeBuffer) {
      this.writeBuffer = new Uint8Array(this.wasmSaxParser.memory.buffer, 0, this.options.highWaterMark);
      this.readBuffer = new Uint8Array(this.wasmSaxParser.memory.buffer);
    }
    this.writeBuffer.set(slice);
    write(offset, slice.length);
  }

  public end(): void {
    this.wasmSaxParser.end();
  }

  public async prepareWasm(saxWasm: Uint8Array): Promise<WebAssembly.Memory> {
    const result = await WebAssembly.instantiate(saxWasm, {
      env: {
        memoryBase: 0,
        tableBase: 0,
        memory: new WebAssembly.Memory({ initial: 32 } as WebAssembly.MemoryDescriptor),
        table: new WebAssembly.Table({ initial: 1, element: 'anyfunc' } as WebAssembly.TableDescriptor),
        event_listener: this.eventTrap
      }
    });
    if (result) {
      const { parser } = this.wasmSaxParser = result.instance.exports;
      parser(this.events);
      return parser;
    }
  }

  protected eventTrap = (event: number, ptr: number, len: number): void => {
    let payload: Reader<any> | string | Position;
    switch (event) {
      case SaxEventType.Attribute:
        payload = new Attribute(this.readBuffer, ptr);
        break;

      case SaxEventType.OpenTag:
      case SaxEventType.CloseTag:
      case SaxEventType.OpenTagStart:
        payload = new Tag(this.readBuffer, ptr);
        break;

      case SaxEventType.Text:
        payload = new Text(this.readBuffer, ptr);
        break;

      case SaxEventType.OpenCDATA:
        payload = readPosition(this.readBuffer, ptr);
        break;

      default:
        payload = readString(this.readBuffer.buffer, ptr, len);
        break;
    }

    this.eventHandler(event, payload);
  }
}

function stringToUtf8Buffer(value: string): Uint8Array {
  const env = (global || window);
  // Node
  if ((env as any).Buffer !== undefined) {
    return Buffer.from(value);
  }
  // Web
  return (SAXParser.textEncoder || (SAXParser.textEncoder = new TextEncoder())).encode(value);
}

function readString(data: ArrayBuffer, byteOffset: number, length: number): string {
  const env = (global || window);
  // Node
  if ((env as any).Buffer !== undefined) {
    return Buffer.from(data, byteOffset, length).toString();
  }
  // Web
  return (SAXParser.textDecoder || (SAXParser.textDecoder = new TextDecoder()))
    .decode(new Uint8Array(data, byteOffset, length));
}

function readU32(uint8Array: Uint8Array, ptr: number): number {
  return (uint8Array[ptr + 3] << 24) | (uint8Array[ptr + 2] << 16) | (uint8Array[ptr + 1] << 8) | uint8Array[ptr];
}

function readPosition(uint8Array: Uint8Array, ptr: number = 0): Position {
  const line = readU32(uint8Array, ptr);
  const character = readU32(uint8Array, ptr + 4);
  return new Position(line, character);
}
