"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class Options {
}
Options.Trim = 0b1;
Options.Normalize = 0b10;
Options.Lowercase = 0b100;
Options.XmlNS = 0b1000;
Options.StrictEntities = 0b10000;
Options.Strict = 0b100000;
Options.NoScript = 0b1000000;
exports.Options = Options;
class SaxEventType {
}
// 1
SaxEventType.Text = 0b1;
// 2
SaxEventType.ProcessingInstruction = 0b10;
// 4
SaxEventType.SGMLDeclaration = 0b100;
// 8
SaxEventType.Doctype = 0b1000;
// 16
SaxEventType.Comment = 0b10000;
// 32
SaxEventType.OpenTagStart = 0b100000;
// 64
SaxEventType.Attribute = 0b1000000;
// 128
SaxEventType.OpenTag = 0b10000000;
// 256
SaxEventType.CloseTag = 0b100000000;
// 512
SaxEventType.OpenCDATA = 0b1000000000;
// 1024
SaxEventType.Cdata = 0b10000000000;
// 2048
SaxEventType.CloseCDATA = 0b100000000000;
// 4096
SaxEventType.Script = 0b1000000000000;
// 8192
SaxEventType.CloseNamespace = 0b10000000000000;
// 16384
SaxEventType.OpenNamespace = 0b100000000000000;
exports.SaxEventType = SaxEventType;
class SaxErrorType {
}
SaxErrorType.UnclosedRootTag = 1;
SaxErrorType.XmlPrefixBinding = 2;
SaxErrorType.XmlnsPrefixBinding = 3;
SaxErrorType.UnboundNSPrefix = 4;
SaxErrorType.EmptyCloseTag = 5;
SaxErrorType.UnexpectedCloseTag = 6;
SaxErrorType.UnmatchedCloseTag = 7;
SaxErrorType.InvalidCharacterEntity = 8;
SaxErrorType.NonWhitespaceBeforeFirstTag = 9;
SaxErrorType.TextDataOutsideRootNode = 10;
SaxErrorType.UnencodedLessThan = 11;
SaxErrorType.MisplacedDoctype = 12;
SaxErrorType.MalformedComment = 13;
SaxErrorType.InvalidCharInTagName = 14;
SaxErrorType.MisplacedForwardSlash = 15;
SaxErrorType.InvalidAttributeName = 16;
SaxErrorType.AttributeWithoutValue = 17;
SaxErrorType.UnquotedAttributeValue = 18;
SaxErrorType.AttributesNotSeparated = 19;
SaxErrorType.InvalidClosingTagName = 20;
SaxErrorType.InvalidCharsInCloseTag = 21;
SaxErrorType.InvalidCharInEntityName = 22;
exports.SaxErrorType = SaxErrorType;
const jsonFlag = SaxEventType.Attribute |
    SaxEventType.OpenTag |
    SaxEventType.CloseTag |
    SaxEventType.OpenCDATA |
    SaxEventType.CloseCDATA |
    SaxEventType.OpenNamespace |
    SaxEventType.CloseNamespace;
class SAXParser {
    constructor(events = 0) {
        this.eventTrap = (event, ptr, len) => {
            const { memory } = this.wasmSaxParser;
            const rawUtf8String = uint8ToUtf8(memory.buffer, ptr, len);
            const payload = event & jsonFlag ? JSON.parse(rawUtf8String) : rawUtf8String;
            this.eventHandler(event, payload);
        };
        const self = this;
        Object.defineProperties(this, {
            events: {
                get: function () {
                    return ~~events;
                },
                set: function (value) {
                    events = ~~value;
                    if (self.wasmSaxParser) {
                        self.wasmSaxParser.parser(events);
                    }
                }, configurable: false, enumerable: true
            }
        });
    }
    write(value) {
        const { memory, write } = this.wasmSaxParser;
        const slice = stringToUtf8Buffer(value);
        const memBuff = new Uint8Array(memory.buffer, 0, slice.length);
        memBuff.set(slice);
        write(0, memBuff.length);
    }
    async prepareWasm(saxWasm) {
        const result = await WebAssembly.instantiate(saxWasm, {
            env: {
                memoryBase: 0,
                tableBase: 0,
                memory: new WebAssembly.Memory({ initial: 256 }),
                table: new WebAssembly.Table({ initial: 4, element: 'anyfunc' }),
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
}
exports.SAXParser = SAXParser;
function stringToUtf8Buffer(value) {
    const env = (global || window);
    // Node
    if ('Buffer' in env) {
        return Buffer.from(value);
    }
    // Web
    return new TextEncoder().encode(value);
}
function uint8ToUtf8(buffer, ptr, length) {
    const env = (global || window);
    // Node
    if ('Buffer' in env) {
        return Buffer.from(buffer, ptr, length).toString();
    }
    // Web
    return (SAXParser.textDecoder || (SAXParser.textDecoder = new TextDecoder()))
        .decode(new Uint8Array(buffer, ptr, length));
}
