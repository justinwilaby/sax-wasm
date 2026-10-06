import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const baselineIndex = process.argv.indexOf('--baseline');
if (baselineIndex < 0) throw new Error('Usage: node scripts/verify-performance.mjs --baseline /path/to/baseline');
const roots = [resolve(process.argv[baselineIndex + 1]), fileURLToPath(new URL('..', import.meta.url))];
const configurations = roots.map(root => ({ wrapperRoot: root, wasmRoot: root }));
if (process.argv.includes('--legacy-compat')) {
  configurations.push({ wrapperRoot: roots[1], wasmRoot: roots[0] });
  const { SAXParser } = await import(pathToFileURL(resolve(roots[0], 'lib/esm/index.js')).href);
  const currentModule = await WebAssembly.compile(readFileSync(resolve(roots[1], 'lib/sax-wasm.wasm')));
  await assert.rejects(new SAXParser().prepareWasm(currentModule), WebAssembly.LinkError,
    'An old wrapper must reject the versioned callback import rather than misread descriptors');
}
const parsers = await Promise.all(configurations.map(async ({ wrapperRoot, wasmRoot }) => {
  const { SAXParser } = await import(pathToFileURL(resolve(wrapperRoot, 'lib/esm/index.js')).href);
  const parser = new SAXParser();
  await parser.prepareWasm(await WebAssembly.compile(readFileSync(resolve(wasmRoot, 'lib/sax-wasm.wasm'))));
  return parser;
}));
const encoder = new TextEncoder();
const fixtures = [];
for (const length of [0, 1, 14, 15, 16, 17, 30, 31, 32, 33, 63, 64, 65, 255]) {
  fixtures.push(encoder.encode(`<?target data?><root title="${'a'.repeat(length)}\n🚀é日本語${'b'.repeat(length)}" empty="">${'x'.repeat(length)}é🚀${'y'.repeat(length)}<child boolean value=unquoted/><child name='value'>content</child><!--${'c'.repeat(length)}--><![CDATA[${'d'.repeat(length)}]]></root>`));
}
fixtures.push(encoder.encode('<!DOCTYPE root [<!ENTITY example "value">]><root><nested><leaf/><leaf/></nested></root>'));
fixtures.push(encoder.encode('<><Component {...props} value={{hello: "world"}} [class.active]="active" /></>'));
fixtures.push(encoder.encode('<root>text</orphan><child/>more text</root>'));
fixtures.push(encoder.encode('<root><!--a>b--><![CDATA[x>y]]><!-- --><![CDATA[]]></root>'));
fixtures.push(encoder.encode('<?target content?><!DOCTYPE root><root/>'));
fixtures.push(encoder.encode('<root empty="" optional unknown/><root></root>tail'));
// Every event mask exercises ownership paths with and without tag retention.
let comparisons = 0;
for (let mask = 0; mask < 1024; mask++) {
  for (const [fixtureIndex, bytes] of fixtures.entries()) {
    for (const chunkSize of [1, 7, 15, 16, 17, 31, 32, 33, 64, 127, bytes.length]) {
      const traces = parsers.map(parser => {
        const trace = [];
        parser.events = mask;
        parser.eventHandler = (event, detail) => trace.push([event, detail.toJSON()]);
        for (let offset = 0; offset < bytes.length; offset += chunkSize) parser.write(bytes.subarray(offset, offset + chunkSize));
        parser.end();
        return trace;
      });
      // Position instances come from distinct module copies; compare values.
      for (let configuration = 1; configuration < traces.length; configuration++) {
        assert.equal(JSON.stringify(traces[configuration]), JSON.stringify(traces[0]), `config=${configuration}, mask=${mask}, fixture=${fixtureIndex}, chunk=${chunkSize}`);
        comparisons++;
      }
    }
  }
}
console.log(`${comparisons} complete event traces match the baseline, including all 1,024 event masks.`);
// Self-closing callbacks can enable or disable CloseTag during OpenTag.
for (const initiallyClose of [false, true]) {
  const traces = parsers.map(parser => {
    const trace = [];
    parser.events = 128 | (initiallyClose ? 256 : 0);
    parser.eventHandler = (event, detail) => {
      trace.push([event, detail.toJSON()]);
      if (event === 128) parser.events ^= 256;
    };
    parser.write(encoder.encode('<item/><next/>'));
    parser.end();
    return trace;
  });
  for (let configuration = 1; configuration < traces.length; configuration++) {
    assert.equal(JSON.stringify(traces[configuration]), JSON.stringify(traces[0]), `dynamic subscriptions, config=${configuration}, initiallyClose=${initiallyClose}`);
  }
}
console.log('Callback-time subscription changes also match the baseline.');
