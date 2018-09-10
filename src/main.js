const fs = require('fs');
const path = require('path');

async function runProgram() {
  let result;

  function event_listener(event, ptr, len) {
    const linearMemory = result.instance.exports.memory;
    const memBuff = Buffer.from(linearMemory.buffer, ptr, len);
    console.log(event, memBuff.toString());
  }

  function error_handler(error, ptr, len) {

  }

  const imports = {
    env: {
      memoryBase: 0,
      tableBase: 0,
      memory: new WebAssembly.Memory({initial: 10, maximum: 100}),
      table: new WebAssembly.Table({initial: 4, element: 'anyfunc'}),
      event_listener,
      error_handler
    }
  };

  const wasm = fs.readFileSync(path.resolve(__dirname, '../lib/sax-wasm.wasm'));
  result = await WebAssembly.instantiate(wasm, imports);
  const linearMemory = result.instance.exports.memory;
  const document = `export class Sample {
  render() {
    return (
      <card>
      </>
      </card>
    )
  }
}
`;
  const docBuff = Buffer.from(document);

  let memBuff = new Uint8Array(linearMemory.buffer, 0, docBuff.length);
  memBuff.set(docBuff, 0);
  result.instance.exports.parser(0b111111111111);
  result.instance.exports.write(0, memBuff.length);
}

runProgram().catch(e => console.log(e));
