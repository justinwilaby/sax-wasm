export declare class SaxEventType {
    static Text: number;
    static ProcessingInstruction: number;
    static SGMLDeclaration: number;
    static Doctype: number;
    static Comment: number;
    static OpenTagStart: number;
    static Attribute: number;
    static OpenTag: number;
    static CloseTag: number;
    static Cdata: number;
}
export type Detail = Position | Attribute | Text | Tag | ProcInst;
export declare abstract class Reader<T = Detail> {
    protected data: Uint8Array;
    protected cache: {
        [prop: string]: T;
    };
    protected ptr: number;
    constructor(data: Uint8Array, ptr?: number);
    abstract toJSON(): {
        [prop: string]: T;
    };
}
export declare class Position {
    line: number;
    character: number;
    constructor(line: number, character: number);
}
export declare enum AttributeType {
    Normal = 0,
    JSX = 1
}
export declare class Attribute extends Reader<Text | AttributeType> {
    type: AttributeType;
    name: Text;
    value: Text;
    constructor(buffer: Uint8Array, ptr?: number);
    toJSON(): {
        [prop: string]: Text | AttributeType;
    };
    toString(): string;
}
export declare class ProcInst extends Reader<Position | Text> {
    target: Text;
    content: Text;
    constructor(buffer: Uint8Array, ptr?: number);
    get start(): Position;
    get end(): Position;
    toJSON(): {
        [p: string]: Position | Text;
    };
    toString(): string;
}
export declare class Text extends Reader<string | Position> {
    get start(): Position;
    get end(): Position;
    get value(): string;
    toJSON(): {
        [prop: string]: string | Position;
    };
    toString(): string;
}
export declare class Tag extends Reader<Attribute[] | Text[] | Position | string | number | boolean> {
    get openStart(): Position;
    get openEnd(): Position;
    get closeStart(): Position;
    get closeEnd(): Position;
    get selfClosing(): boolean;
    get name(): string;
    get attributes(): Attribute[];
    get textNodes(): Text[];
    toJSON(): {
        [p: string]: Attribute[] | Text[] | Position | string | number | boolean;
    };
    get value(): string;
}
interface WasmSaxParser extends WebAssembly.Exports {
    memory: WebAssembly.Memory;
    parser: (events: number) => void;
    write: (pointer: number, length: number) => void;
    end: () => void;
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
    eventHandler?: (type: SaxEventType, detail: Detail) => void;
    private writeBuffer?;
    constructor(events?: number);
    parse(reader: ReadableStreamDefaultReader<Uint8Array>): AsyncGenerator<[SaxEventType, Detail]>;
    write(chunk: Uint8Array): void;
    end(): void;
    prepareWasm(source: Response | Promise<Response>): Promise<boolean>;
    prepareWasm(saxWasm: Uint8Array): Promise<boolean>;
    eventTrap: (event: number, ptr: number, len: number) => void;
}
export {};
