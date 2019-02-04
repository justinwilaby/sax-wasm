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
  constructor(buf: Uint8Array, ptr: number) {
    this.read(buf, ptr);
  }

  protected abstract read(buf: Uint8Array, ptr: number): void;
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

  protected read(buf: Uint8Array, ptr: number): void {
    const namePtr = readU32(buf, ptr);
    const nameLen = readU32(buf, ptr + 4);

    const valuePtr = readU32(buf, ptr + 24);
    const valueLen = readU32(buf, ptr + 28);

    this.nameEnd = readPosition(buf, ptr + 8);
    this.nameStart = readPosition(buf, ptr + 16); // 8 bytes
    this.valueEnd = readPosition(buf, ptr + 32); // 8 bytes
    this.valueStart = readPosition(buf, ptr + 40); // 8 bytes
    this.name = readString(buf.buffer, namePtr, nameLen);
    this.value = readString(buf.buffer, valuePtr, valueLen);
  }
}

export class Text extends Reader<string | Position> {
  public static BYTES_IN_DESCRIPTOR = 24;

  public end: Position;
  public start: Position;
  public value: string;

  protected read(buf: Uint8Array, ptr: number): void {
    const valuePtr = readU32(buf, ptr + 16);
    const valueLen = readU32(buf, ptr + 20);

    this.end = readPosition(buf, ptr);
    this.start = readPosition(buf, ptr + 8);
    this.value = readString(buf.buffer, valuePtr, valueLen);
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

  protected read(buf: Uint8Array, ptr: number): void {

    this.closeEnd = readPosition(buf, ptr);
    this.closeStart = readPosition(buf, ptr + 8);
    this.openEnd = readPosition(buf, ptr + 16);
    this.openStart = readPosition(buf, ptr + 24);

    const namePtr = readU32(buf, ptr + 32);
    const nameLen = readU32(buf, ptr + 36);
    this.name = readString(buf.buffer, namePtr, nameLen);

    this.selfClosing = !!buf[ptr + 40];

    let offset = ptr + 41;
    const attributes = [] as Attribute[];
    let numAttrs = readU32(buf, offset);
    offset += 4;
    for (let i = 0; i < numAttrs; i++) {
      attributes[i] = new Attribute(buf, offset);
      offset += Attribute.BYTES_IN_DESCRIPTOR;
    }
    this.attributes = attributes;

    const textNodes = [] as Text[];
    let numNodes = readU32(buf, offset);
    offset += 4;
    for (let i = 0; i < numNodes; i++) {
      textNodes[i] = new Text(buf, offset);
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

export class SAXParser {
  public static textDecoder: TextDecoder; // Web only
  public static textEncoder: TextEncoder; // web only

  public events: number;
  public eventHandler: (type: SaxEventType, detail: Reader<any> | Position | string) => void;
  private wasmSaxParser: WasmSaxParser;

  constructor(events = 0) {
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

  public write(value: string): void {
    const { memory, write } = this.wasmSaxParser;
    const slice = stringToUtf8Buffer(value);
    const memBuff = new Uint8Array(memory.buffer, 0, slice.length);
    memBuff.set(slice);
    write(0, memBuff.length);
  }

  public end(): void {
    this.wasmSaxParser.end();
  }

  public async prepareWasm(saxWasm: Uint8Array): Promise<boolean> {
    const result = await WebAssembly.instantiate(saxWasm, {
      env: {
        memoryBase: 0,
        tableBase: 0,
        memory: new WebAssembly.Memory({ initial: 256 } as WebAssembly.MemoryDescriptor),
        table: new WebAssembly.Table({ initial: 4, element: 'anyfunc' } as WebAssembly.TableDescriptor),
        event_listener: this.eventTrap
      }
    });
    if (result) {
      const { parser } = this.wasmSaxParser = result.instance.exports;
      parser(this.events);
      return true;
    }
    return false;
  }

  protected eventTrap = (event: number, ptr: number, len: number): void => {
    const buffer = this.wasmSaxParser.memory.buffer;
    let payload: Reader<any> | string | Position;

    switch (event) {
      case SaxEventType.Attribute:
        payload = new Attribute(new Uint8Array(buffer), ptr);
        break;

      case SaxEventType.OpenTag:
      case SaxEventType.CloseTag:
      case SaxEventType.OpenTagStart:
        payload = new Tag(new Uint8Array(buffer), ptr);
        break;

      case SaxEventType.Text:
        payload = new Text(new Uint8Array(buffer), ptr);
        break;

      case SaxEventType.OpenCDATA:
        payload = readPosition(new Uint8Array(buffer), ptr);
        break;

      default:
        payload = readString(buffer, ptr, len);
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

function readPosition(data: Uint8Array, ptr: number = 0): Position {
  const line = readU32(data, ptr);
  const character = readU32(data, ptr + 4);
  return new Position(line, character);
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

function readU32(buffer: Uint8Array, ptr: number): number {
  return buffer[ptr + 3] << 24 | buffer[ptr + 2] << 16 | buffer[ptr + 1] << 8 | buffer[ptr];
}
