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
  constructor(buf: Uint32Array, ptr: number = 0) {
    this.read(buf, ptr);
  }

  protected abstract read(buf: Uint32Array, ptr: number): void;
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
  public static BYTES_IN_DESCRIPTOR = 12;

  public nameEnd: Position;
  public nameStart: Position;
  public valueEnd: Position;
  public valueStart: Position;
  public name: string;
  public value: string;

  protected read(buf: Uint32Array, ptr: number): void {
    const namePtr = buf[ptr];
    const nameLen = buf[ptr + 1];
    this.name = readString(buf.buffer, namePtr, nameLen);

    this.nameEnd = new Position(buf[ptr + 2], buf[ptr + 3]);
    this.nameStart = new Position(buf[ptr + 4], buf[ptr + 5]);

    const valuePtr = buf[ptr + 6];
    const valueLen = buf[ptr + 7];
    this.value = readString(buf.buffer, valuePtr, valueLen);

    this.valueEnd = new Position(buf[ptr + 8], buf[ptr + 9]);
    this.valueStart = new Position(buf[ptr + 10], buf[ptr + 11]);
  }
}

export class Text extends Reader<string | Position> {
  public static BYTES_IN_DESCRIPTOR = 6;

  public end: Position;
  public start: Position;
  public value: string;

  protected read(buf: Uint32Array, ptr: number): void {
    const valuePtr = buf[ptr + 4];
    const valueLen = buf[ptr + 5];

    this.end = new Position(buf[ptr], buf[ptr + 1]);
    this.start = new Position(buf[ptr + 2], buf[ptr + 3]);
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

  protected read(buf: Uint32Array): void {
    this.closeEnd = new Position(buf[0], buf[1]);
    this.closeStart = new Position(buf[2], buf[3]);
    this.openEnd = new Position(buf[4], buf[5]);
    this.openStart = new Position(buf[6], buf[7]);

    const namePtr = buf[8];
    const nameLen = buf[9];
    this.name = readString(buf.buffer, namePtr, nameLen);

    this.selfClosing = !!buf[10];

    let offset = 11;
    const attributes = [] as Attribute[];
    let numAttrs = buf[offset];
    offset ++;
    for (let i = 0; i < numAttrs; i++) {
      attributes[i] = new Attribute(buf, offset);
      offset += Attribute.BYTES_IN_DESCRIPTOR;
    }
    this.attributes = attributes;

    const textNodes = [] as Text[];
    let numNodes = buf[offset];
    offset ++;
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
  }

  protected eventTrap = (event: number, ptr: number, len: number): void => {
    const buffer = this.wasmSaxParser.memory.buffer;
    let payload: Reader<any> | string | Position;
    switch (event) {
      case SaxEventType.Attribute:
        payload = new Attribute(new Uint32Array(buffer, ptr));
        break;

      case SaxEventType.OpenTag:
      case SaxEventType.CloseTag:
      case SaxEventType.OpenTagStart:
        payload = new Tag(new Uint32Array(buffer, ptr));
        break;

      case SaxEventType.Text:
        payload = new Text(new Uint32Array(buffer, ptr));
        break;

      case SaxEventType.OpenCDATA:
        const b = new Uint32Array(buffer, ptr, 2);
        payload = new Position(b[0], b[1]);
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
