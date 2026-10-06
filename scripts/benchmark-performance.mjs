import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

// Compare warmed parsers in alternating order; compilation, fixture construction,
// and filesystem access are outside the measured region.
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
};
const rounds = Number(option('--rounds', 15));
const warmups = Number(option('--warmups', 8));
const chunkSize = Number(option('--chunk-size', 64 * 1024));
if (![rounds, chunkSize].every(n => Number.isSafeInteger(n) && n > 0) || !Number.isSafeInteger(warmups) || warmups < 0) {
  throw new Error('Rounds and chunk size must be positive integers; warmups must be a nonnegative integer.');
}
const baseline = option('--baseline');
const output = option('--output');
const currentRoot = fileURLToPath(new URL('..', import.meta.url));
const encoder = new TextEncoder();
const repeat = (row) => encoder.encode(`<root>${row.repeat(Math.ceil(2 * 1024 * 1024 / row.length))}</root>`);
const fixtures = {
  xml: new Uint8Array(readFileSync(new URL('../src/js/__test__/xml.xml', import.meta.url))),
  text: repeat(`<item>${'ordinary ASCII text '.repeat(100)}</item>\n`),
  attributes: repeat(`<item id="12345" title="${'attribute value '.repeat(20)}" enabled='yes'/>\n`),
  unicode: repeat(`<item title="café 日本語 🚀">${'text café 日本語 🚀 '.repeat(30)}</item>\n`),
  markup: repeat(`<item><!--${'comment text '.repeat(10)}--><![CDATA[${'CDATA text '.repeat(10)}]]><?target ${'instruction text '.repeat(10)}?></item>\n`),
};
const roots = baseline ? [resolve(baseline), currentRoot] : [currentRoot];
const builds = await Promise.all(roots.map(async (root) => ({
  root,
  ...(await import(pathToFileURL(resolve(root, 'lib/esm/index.js')).href)),
  module: await WebAssembly.compile(readFileSync(resolve(root, 'lib/sax-wasm.wasm'))),
})));
const results = [];
for (const [fixture, bytes] of Object.entries(fixtures)) {
  for (const mode of ['none', 'callback', 'read', 'json']) {
    const chunks = [];
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      chunks.push(bytes.subarray(offset, offset + chunkSize));
    }
    const states = await Promise.all(builds.map(async (build) => {
      const E = build.SaxEventType;
      const events = E.OpenTag | E.CloseTag | E.Text | E.Attribute
        | (fixture === 'markup' ? E.Comment | E.Cdata | E.ProcessingInstruction | E.Doctype : 0);
      const parser = new build.SAXParser(mode === 'none' ? 0 : events);
      await parser.prepareWasm(build.module);
      const state = { parser, samples: [], count: 0, checksum: 0 };
      parser.eventHandler = (event, detail) => {
        state.count++;
        if (mode === 'read') {
          state.checksum += detail.byteOffsets.end;
          if (event === E.Attribute) {
            state.checksum += detail.name.value.length + detail.value.value.length + detail.value.end.character;
          } else if (event === E.ProcessingInstruction) {
            state.checksum += detail.target.value.length + detail.content.value.length + detail.end.character;
          } else {
            state.checksum += detail.value.length;
            state.checksum += event === E.OpenTag || event === E.CloseTag ? detail.openEnd.character : detail.end.character;
          }
        } else if (mode === 'json') {
          const value = detail.toJSON();
          state.checksum += value.byteOffsets.end;
        }
      };
      return state;
    }));
    let expected;
    for (let iteration = -warmups; iteration < rounds; iteration++) {
      const order = iteration % 2 ? [...states].reverse() : states;
      for (const state of order) {
        state.count = state.checksum = 0;
        const start = performance.now();
        for (const chunk of chunks) state.parser.write(chunk);
        state.parser.end();
        const elapsed = performance.now() - start;
        const actual = `${state.count}:${state.checksum}`;
        expected ??= actual;
        if (actual !== expected) throw new Error(`${fixture}/${mode}: ${actual} != ${expected}`);
        if (iteration >= 0) state.samples.push(elapsed);
      }
    }
    const medians = states.map((state) => [...state.samples].sort((a, b) => a - b)[Math.floor(rounds / 2)]);
    const change = baseline ? (1 - medians[1] / medians[0]) * 100 : undefined;
    const memoryBytes = states.map(state => state.parser.wasmSaxParser.memory.buffer.byteLength);
    const row = { fixture, mode, bytes: bytes.length, chunkSize, medians, change, samples: states.map(s => s.samples), memoryBytes, eventsAndChecksum: expected };
    results.push(row);
    console.log(`${fixture.padEnd(10)} ${mode.padEnd(8)} ${medians.map(n => n.toFixed(3) + ' ms').join(' -> ')}${baseline ? ` (${change.toFixed(1)}% less time)` : ''}`);
  }
}
if (output) writeFileSync(output, JSON.stringify({ node: process.version, platform: process.platform, arch: process.arch, rounds, warmups, roots, results }, null, 2) + '\n');
