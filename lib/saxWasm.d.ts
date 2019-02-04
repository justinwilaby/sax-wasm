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
    static OpenCDATA: number;
    static Cdata: number;
    static CloseCDATA: number;
}
declare abstract class Reader<T> {
    constructor(buf: Uint8Array, ptr: number);
    protected abstract read(buf: Uint8Array, ptr: number): void;
}
export declare class Position {
    line: number;
    character: number;
    constructor(line: number, character: number);
}
export declare class Attribute extends Reader<string | number | Position> {
    static BYTES_IN_DESCRIPTOR: number;
    nameEnd: Position;
    nameStart: Position;
    valueEnd: Position;
    valueStart: Position;
    name: string;
    value: string;
    protected read(buf: Uint8Array, ptr: number): void;
}
export declare class Text extends Reader<string | Position> {
    static BYTES_IN_DESCRIPTOR: number;
    end: Position;
    start: Position;
    value: string;
    protected read(buf: Uint8Array, ptr: number): void;
}
export declare class Tag extends Reader<Attribute[] | Text[] | Position | string | number | boolean> {
    name: string;
    attributes: Attribute[];
    textNodes: Text[];
    selfClosing: boolean;
    openStart: Position;
    openEnd: Position;
    closeStart: Position;
    closeEnd: Position;
    protected read(buf: Uint8Array, ptr: number): void;
}
export declare class SAXParser {
    static textDecoder: TextDecoder;
    static textEncoder: TextEncoder;
    events: number;
    eventHandler: (type: SaxEventType, detail: Reader<any> | Position | string) => void;
    private wasmSaxParser;
    constructor(events?: number);
    write(value: string): void;
    end(): void;
    prepareWasm(saxWasm: Uint8Array): Promise<boolean>;
    protected eventTrap: (event: number, ptr: number, len: number) => void;
}
export {};
