const fs = require('fs');
const path = require('path');
const SaxeventType = require('../lib/cjs/index.js').SaxEventType;
async function runProgram() {
  let result;

  function event_listener(event, ptr, len) {
    const linearMemory = result.instance.exports.memory;
    const memBuff = Buffer.from(linearMemory.buffer, ptr);
    const rawString = memBuff.toString();
    // Note that this is low level encoded data
    // See SAXParser.eventTrap for examples on how this is decoded
    console.log(event, rawString);
  }

  function error_handler(error, ptr, len) {

  }

  const imports = {
    env: {
      memoryBase: 0,
      tableBase: 0,
      memory: new WebAssembly.Memory({initial: 10, maximum: 100, shared: true}),
      table: new WebAssembly.Table({initial: 4, element: 'anyfunc'}),
      event_listener,
      error_handler
    }
  };

  const wasm = fs.readFileSync(path.resolve(__dirname, '../lib/sax-wasm.wasm'));
  result = await WebAssembly.instantiate(wasm, imports);
  const linearMemory = result.instance.exports.memory;
  result.instance.exports.parser(0b1111111111);

  const document = `export class Sample {
  render() {
    return (
      <card>
        <input type="date />
        <text size="medium" isSubtle={true} horizontalAlignment="right" weight="bolder">My First ACX card!</text>
      </card>
    )
  }
}
`;
  const docBuff = Buffer.from(document);

  let memBuff = new Uint8Array(linearMemory.buffer, 0, docBuff.length);
  memBuff.set(docBuff, 0);
  result.instance.exports.write(0, memBuff.length);
}

runProgram().catch(e => console.log(e));
