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
  protected readonly cache: { [prop: string]: T } = {};
  protected readonly source: { [prop: string]: Uint8Array } = {};

  constructor(buf: Uint8Array, ptr: number) {
    this.read(buf, ~~ptr);
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
  public static BYTES_IN_DESCRIPTOR = +48;

  protected read(buf: Uint8Array, ptr: number): void {
    const namePtr = readU32(buf, ptr);
    const nameLen = readU32(buf, ptr + 4);

    const valuePtr = readU32(buf, ptr + 24);
    const valueLen = readU32(buf, ptr + 28);

    this.source.nameEnd = buf.slice(ptr + 8, ptr + 16); // 8 bytes
    this.source.nameStart = buf.slice(ptr + 16, ptr + 24); // 8 bytes
    this.source.valueEnd = buf.slice(ptr + 32, ptr + 40); // 8 bytes
    this.source.valueStart = buf.slice(ptr + 40, ptr + 48); // 8 bytes
    this.source.name = buf.slice(namePtr, namePtr + nameLen);
    this.source.value = buf.slice(valuePtr, valuePtr + valueLen);
  }

  get name(): string {
    if (this.cache.name) {
      return this.cache.name as string;
    }
    return (this.cache.name = readString(this.source.name));
  }

  get nameEnd(): Position {
    return this.cache.nameEnd as Position || (this.cache.nameEnd = readPosition(this.source.nameEnd));
  }

  get nameStart(): Position {
    return this.cache.nameStart as Position || (this.cache.nameStart = readPosition(this.source.nameStart));
  }

  get value(): string {
    if (this.cache.value) {
      return this.cache.value as string;
    }
    return (this.cache.value = readString(this.source.value));
  }

  get valueEnd(): Position {
    return this.cache.valueEnd as Position || (this.cache.valueEnd = readPosition(this.source.valueEnd));
  }

  get valueStart(): Position {
    return this.cache.valueStart as Position || (this.cache.valueStart = readPosition(this.source.valueStart));
  }
}

export class Text extends Reader<string | Position> {
  public static BYTES_IN_DESCRIPTOR = +24;

  protected read(buf: Uint8Array, ptr: number): void {
    const valuePtr = readU32(buf, ptr + 16);
    const valueLen = readU32(buf, ptr + 20);

    this.source.value = buf.slice(valuePtr, valuePtr + valueLen);
    this.source.end = buf.slice(0, 8);
    this.source.start = buf.slice(8, 16);
  }

  get end(): Position {
    return this.cache.end as Position || (this.cache.end = readPosition(this.source.end));
  }

  get start(): Position {
    return this.cache.start as Position || (this.cache.start = readPosition(this.source.start));
  }

  get value(): string {
    return (this.cache.value = readString(this.source.value));
  }
}

export class Tag extends Reader<Attribute[] | Text[] | Position | string | number | boolean> {

  protected read(buf: Uint8Array, ptr: number): void {

    this.source.closeEnd = buf.slice(ptr, ptr + 8);
    this.source.closeStart = buf.slice(ptr + 8, ptr + 16);
    this.source.openEnd = buf.slice(ptr + 16, ptr + 24);
    this.source.openStart = buf.slice(ptr + 24, ptr + 32);

    const namePtr = readU32(buf, ptr + 32);
    const nameLen = readU32(buf, ptr + 36);
    this.source.name = buf.slice(namePtr, namePtr + nameLen);
    this.cache.selfClosing = buf[ptr + 40];

    let offset = ptr + 41;
    const attributes = [] as Attribute[];
    let numAttrs = readU32(buf, offset);
    offset += 4;
    for (let i = 0; i < numAttrs; i++) {
      attributes[i] = new Attribute(buf, offset);
      offset += Attribute.BYTES_IN_DESCRIPTOR;
    }
    this.cache.attributes = attributes;
    const textNodes = [] as Text[];
    let numNodes = readU32(buf, offset);
    offset += 4;
    for (let i = 0; i < numNodes; i++) {
      textNodes[i] = new Text(buf, offset);
      offset += Text.BYTES_IN_DESCRIPTOR;
    }
    this.cache.textNodes = textNodes;
  }

  get attributes(): Attribute[] {
    return this.cache.attributes as Attribute[];
  }

  get textNodes(): Text[] {
    return this.cache.textNodes as Text[];
  }

  get closeEnd(): Position {
    if (this.cache.closeEnd) {
      return this.cache.closeEnd as Position;
    }
    return (this.cache.closeEnd = readPosition(this.source.closeEnd));
  }

  get closeStart(): Position {
    if (this.cache.closeStart) {
      return this.cache.closeStart as Position;
    }
    return (this.cache.closeStart = readPosition(this.source.closeStart));
  }

  get openEnd(): Position {
    if (this.cache.openEnd) {
      return this.cache.openEnd as Position;
    }
    return (this.cache.openEnd = readPosition(this.source.openEnd));
  }

  get openStart(): Position {
    if (this.cache.openStart) {
      return this.cache.openStart as Position;
    }
    return (this.cache.openStart = readPosition(this.source.openStart));
  }

  get name(): string {
    return (this.cache.name = readString(this.source.name));
  }

  get selfClosing(): boolean {
    return this.cache.selfClosing as boolean;
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
    const { memory } = this.wasmSaxParser;
    const data = new Uint8Array(memory.buffer);
    let payload: Reader<any> | string | Position;

    switch (event) {
      case SaxEventType.Attribute:
        payload = new Attribute(data, ptr);
        break;

      case SaxEventType.OpenTag:
      case SaxEventType.CloseTag:
      case SaxEventType.OpenTagStart:
        payload = new Tag(data, ptr);
        break;

      case SaxEventType.Text:
        payload = new Text(data, ptr);
        break;

      case SaxEventType.OpenCDATA:
        payload = readPosition(data, ptr);
        break;

      default:
        payload = readString(data.slice(ptr, ptr + len));
        break;
    }

    this.eventHandler(event, payload);
  }
}

function stringToUtf8Buffer(value: string): Uint8Array {
  const env = (global || window);
  // Node
  if ('Buffer' in env) {
    return Buffer.from(value);
  }
  // Web
  return (SAXParser.textEncoder || (SAXParser.textEncoder = new TextEncoder())).encode(value);
}

function readPosition(data: Uint8Array, ptr: number = 0): Position {
  const line = readU32(data, ~~ptr);
  const character = readU32(data, ~~ptr + 4);
  return new Position(line, character);
}

function readString(data: Uint8Array): string {
  const env = (global || window);
  // Node
  if ('Buffer' in env) {
    return Buffer.from(data.buffer).toString();
  }
  // Web
  return (SAXParser.textDecoder || (SAXParser.textDecoder = new TextDecoder()))
    .decode(data);
}

function readU32(buffer: Uint8Array, ptr: number): number {
  return (buffer[ptr + 3] << 24) | (buffer[ptr + 2] << 16) | (buffer[ptr + 1] << 8) | buffer[ptr];
}
