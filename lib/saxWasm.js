export class Options {
}
Options.Trim = 0b1;
Options.Normalize = 0b10;
Options.Lowercase = 0b100;
Options.XmlNS = 0b1000;
Options.StrictEntities = 0b10000;
Options.Strict = 0b100000;
Options.NoScript = 0b1000000;
export class EventFlags {
}
EventFlags.Text = 0b1;
// 2
EventFlags.ProcessingInstruction = 0b10;
// 4
EventFlags.SGMLDeclaration = 0b100;
// 8
EventFlags.Doctype = 0b1000;
// 16
EventFlags.Comment = 0b10000;
// 32
EventFlags.OpenTagStart = 0b100000;
// 64
EventFlags.Attribute = 0b1000000;
// 128
EventFlags.OpenTag = 0b10000000;
// 256
EventFlags.CloseTag = 0b100000000;
// 512
EventFlags.OpenCDATA = 0b1000000000;
// 1024
EventFlags.Cdata = 0b10000000000;
// 2048
EventFlags.CloseCDATA = 0b100000000000;
// 4096
EventFlags.CloseData = 0b1000000000000;
// 8192
EventFlags.Error = 0b10000000000000;
// 16384
EventFlags.End = 0b100000000000000;
// 32768
EventFlags.Ready = 0b1000000000000000;
// 65536
EventFlags.Script = 0b10000000000000000;
// 131072
EventFlags.OpenNamespace = 0b100000000000000000;
// 262144
EventFlags.CloseNamespace = 0b1000000000000000000;
const jsonFlag = EventFlags.Attribute |
    EventFlags.OpenTag |
    EventFlags.CloseTag |
    EventFlags.OpenCDATA |
    EventFlags.CloseCDATA |
    EventFlags.OpenNamespace |
    EventFlags.CloseNamespace;
export class SAXParser {
    constructor(options = 0, events = 0, saxWasm) {
        this.eventTrap = (event, ptr, len) => {
            const { memory } = this.wasmSaxParser;
            const rawUtf8String = uint8ToUtf8(memory.buffer, ptr, len);
            const payload = event & jsonFlag ? JSON.parse(rawUtf8String) : rawUtf8String;
        };
        this.errorTrap = (error, ptr, len) => {
            const { memory } = this.wasmSaxParser;
            const rawUtf8String = uint8ToUtf8(memory.buffer, ptr, len);
        };
        Object.defineProperties(this, {
            options: {
                get: function () {
                    return ~~options;
                },
                set: function (value) {
                    options = ~~value;
                }, configurable: false, enumerable: true
            },
            events: {
                get: function () {
                    return ~~events;
                },
                set: function (value) {
                    events = ~~value;
                }, configurable: false, enumerable: true
            }
        });
        this.prepareWasm(saxWasm);
    }
    prepareWasm(saxWasm) {
        WebAssembly.instantiate(saxWasm, {
            env: {
                memoryBase: 0,
                tableBase: 0,
                memory: new WebAssembly.Memory({ initial: 256 }),
                table: new WebAssembly.Table({ initial: 4, element: 'anyfunc' }),
                event_listener: this.eventTrap,
                error_handler: this.errorTrap
            }
        }).then(result => this.wasmSaxParser = result.instance.exports);
    }
}
function uint8ToUtf8(buffer, ptr, length) {
    const env = (global || window);
    // Node
    if ('Buffer' in env) {
        return Buffer.from(buffer, ptr, length).toString();
    }
    // Web
    return new TextDecoder().decode(new Uint8Array(buffer, ptr, length));
}
