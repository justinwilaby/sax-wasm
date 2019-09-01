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
export declare type Detail = Position | Attribute | Text | Tag | StringReader;
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
    abstract readonly value: any;
}
export declare class Position {
    line: number;
    character: number;
    constructor(line: number, character: number);
}
export declare class Attribute extends Reader<string | number | Position> {
    readonly nameStart: Position;
    readonly nameEnd: Position;
    readonly valueStart: Position;
    readonly valueEnd: Position;
    readonly name: string;
    readonly value: string;
    toJSON(): {
        [prop: string]: string | number | Position;
    };
}
export declare class Text extends Reader<string | Position> {
    readonly start: Position;
    readonly end: Position;
    readonly value: string;
    toJSON(): {
        [prop: string]: string | Position;
    };
}
export declare class StringReader extends Reader<string> {
    readonly value: string;
    toJSON(): {
        [p: string]: string;
    };
    toString(): string;
}
export declare class Tag extends Reader<Attribute[] | Text[] | Position | string | number | boolean> {
    readonly openStart: Position;
    readonly openEnd: Position;
    readonly closeStart: Position;
    readonly closeEnd: Position;
    readonly selfClosing: boolean;
    readonly name: string;
    readonly attributes: Attribute[];
    readonly textNodes: Text[];
    toJSON(): {
        [p: string]: Attribute[] | Text[] | Position | string | number | boolean;
    };
    readonly value: string;
}
export interface SaxParserOptions {
    highWaterMark: number;
}
export declare class SAXParser {
    static textDecoder: TextDecoder;
    events: number;
    eventHandler: (type: SaxEventType, detail: Detail) => void;
    private readonly options;
    private wasmSaxParser;
    private writeBuffer;
    constructor(events?: number, options?: SaxParserOptions);
    write(chunk: Uint8Array, offset?: number): void;
    end(): void;
    prepareWasm(saxWasm: Uint8Array): Promise<boolean>;
    protected eventTrap: (event: number, ptr: number, len: number) => void;
}
