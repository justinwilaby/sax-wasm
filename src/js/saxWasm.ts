import Memory = WebAssembly.Memory;
import MemoryDescriptor = WebAssembly.MemoryDescriptor;
import TableDescriptor = WebAssembly.TableDescriptor;

export class Options {
  static readonly Trim = 0b1;
  static readonly Normalize = 0b10;
  static readonly Lowercase = 0b100;
  static readonly XmlNS = 0b1000;
  static readonly StrictEntities = 0b10000;
  static readonly Strict = 0b100000;
  static readonly NoScript = 0b1000000;
}

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
  // 4096
  public static Script = 0b1000000000000;
  // 8192
  public static CloseNamespace = 0b10000000000000;
  // 16384
  public static OpenNamespace = 0b100000000000000;
}

export class SaxErrorType {
  static readonly UnclosedRootTag = 1;
  static readonly XmlPrefixBinding = 2;
  static readonly XmlnsPrefixBinding = 3;
  static readonly UnboundNSPrefix = 4;
  static readonly EmptyCloseTag = 5;
  static readonly UnexpectedCloseTag = 6;
  static readonly UnmatchedCloseTag = 7;
  static readonly InvalidCharacterEntity = 8;
  static readonly NonWhitespaceBeforeFirstTag = 9;
  static readonly TextDataOutsideRootNode = 10;
  static readonly UnencodedLessThan = 11;
  static readonly MisplacedDoctype = 12;
  static readonly MalformedComment = 13;
  static readonly InvalidCharInTagName = 14;
  static readonly MisplacedForwardSlash = 15;
  static readonly InvalidAttributeName = 16;
  static readonly AttributeWithoutValue = 17;
  static readonly UnquotedAttributeValue = 18;
  static readonly AttributesNotSeparated = 19;
  static readonly InvalidClosingTagName = 20;
  static readonly InvalidCharsInCloseTag = 21;
  static readonly InvalidCharInEntityName = 22;
}

export interface Position {
  line: number;
  character: number;
}

export interface Namespace {
  prefix: string;
  uri: string
}

export interface Attribute {
  name: string;
  value: string;
}

export interface Tag {
  name: string;
  ns: Namespace[];
  attributes: Attribute[];
  prefix: string;
  local: string;
  uri: string;
  text: string;
  self_closing: boolean;
  start: Position;
  end: Position;
}

const jsonFlag = SaxEventType.Attribute |
  SaxEventType.OpenTag |
  SaxEventType.CloseTag |
  SaxEventType.OpenCDATA |
  SaxEventType.CloseCDATA |
  SaxEventType.OpenNamespace |
  SaxEventType.CloseNamespace;

interface WasmSaxParser {
  memory: Memory;
  parser: (events: number) => void;
  write: (pointer: number, length: number) => void;
}

export class SAXParser {
  public static textDecoder: TextDecoder; // Web only

  public events: number;
  public eventHandler: (type: SaxEventType, detail: Tag | Attribute | Namespace | Position | string) => void;
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
    const {memory, write} = this.wasmSaxParser;
    const slice = stringToUtf8Buffer(value);
    const memBuff = new Uint8Array(memory.buffer, 0, slice.length);
    memBuff.set(slice);
    write(0, memBuff.length);
  }

  public async prepareWasm(saxWasm: Uint8Array): Promise<boolean> {
    const result = await WebAssembly.instantiate(saxWasm, {
      env: {
        memoryBase: 0,
        tableBase: 0,
        memory: new WebAssembly.Memory({initial: 256} as MemoryDescriptor),
        table: new WebAssembly.Table({initial: 4, element: 'anyfunc'} as TableDescriptor),
        event_listener: this.eventTrap
      }
    });
    if (result) {
      const {parser} = this.wasmSaxParser = result.instance.exports;
      parser(this.events);
      return true;
    }
    return false;
  }

  protected eventTrap = (event: number, ptr: number, len: number): void => {
    const {memory} = this.wasmSaxParser;
    const rawUtf8String = uint8ToUtf8(memory.buffer, ptr, len);
    const payload = event & jsonFlag ? JSON.parse(rawUtf8String) : rawUtf8String;
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
  return new TextEncoder().encode(value);
}

function uint8ToUtf8(buffer: ArrayBuffer, ptr: number, length: number): string {
  const env = (global || window);
  // Node
  if ('Buffer' in env) {
    return Buffer.from(buffer, ptr, length).toString();
  }
  // Web
  return (SAXParser.textDecoder || (SAXParser.textDecoder = new TextDecoder()))
    .decode(new Uint8Array(buffer, ptr, length));
}
