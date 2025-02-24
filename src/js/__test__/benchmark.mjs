import { createReadStream, readFileSync } from 'fs';
import { URL } from 'url';
import { resolve } from 'path';
import { Buffer } from 'buffer';

import { SAXParser, SaxEventType } from '../../../lib/esm/index.js';

import nodeXml from 'node-xml';
import expat from 'node-expat';
import sax from 'sax';
import LtxSaxParser from 'ltx/lib/Parser.js';
import { SaxesParser } from 'saxes'

// Remove variations in disk access latency
const xml = new Uint8Array(readFileSync(resolve(new URL('./xml.xml', import.meta.url).pathname)));
const chunkLen = 64 * 1024;

async function benchmarkSaxWasmParser() {
  const saxWasm = readFileSync(resolve(new URL('../../../lib/sax-wasm.wasm', import.meta.url).pathname));

  const parser = new SAXParser(SaxEventType.OpenTag);
  parser.eventHandler = (event, detail) => {
    const  j = detail.toJSON();
  };
  await parser.prepareWasm(saxWasm);

  let t = process.hrtime();
  let offset = 0;
  while (offset < xml.length) {
    parser.write(Buffer.from(xml.slice(offset, chunkLen + offset)));
    offset += chunkLen;
  }
  parser.end();
  let [s, n] = process.hrtime(t);
  return (s * 1000) + n / 1000 / 1000;
}

async function benchmarkNodeXmlParser() {
  const parser = new nodeXml.SaxParser(() => void 0);
  const readable = createReadStream(resolve(new URL('./xml.xml', import.meta.url).pathname));
  let t = process.hrtime();
  let offset = 0;
  while (offset < xml.length) {
    parser.parseString(Buffer.from(xml.slice(offset, chunkLen + offset)));
    offset += chunkLen;
  }
  let [s, n] = process.hrtime(t);
  return (s * 1000) + n / 1000 / 1000;
}

async function benchmarkExpatParser() {
  const parser = new expat.Parser();
  let t = process.hrtime();
  let offset = 0;
  while (offset < xml.length) {
    parser.parse(Buffer.from(xml.slice(offset, chunkLen + offset)));
    offset += chunkLen;
  }

  let [s, n] = process.hrtime(t);
  return (s * 1000) + n / 1000 / 1000;
}

async function benchmarkSaxesParser() {
  const parser = new SaxesParser();
  let t = process.hrtime();

  let offset = 0;
  while (offset < xml.length) {
    parser.write(Buffer.from(xml.slice(offset, chunkLen + offset)));
    offset += chunkLen;
  }
  let [s, n] = process.hrtime(t);
  return (s * 1000) + n / 1000 / 1000;
}

async function benchmarkSaxParser() {
  const parser = sax.createStream();
  const readable = createReadStream(resolve(new URL('./xml.xml', import.meta.url).pathname));
  let t = process.hrtime();

  let offset = 0;
  while (offset < xml.length) {
    parser.write(Buffer.from(xml.slice(offset, chunkLen + offset)));
    offset += chunkLen;
  }
  let [s, n] = process.hrtime(t);
  return (s * 1000) + n / 1000 / 1000;
}

async function benchmarkLtxParser() {
  const parser = new LtxSaxParser({ Parser: SaxesParser });
  let t = process.hrtime();

  let offset = 0;
  while (offset < xml.length) {
    parser.write(Buffer.from(xml.slice(offset, chunkLen + offset)));
    offset += chunkLen;
  }

  let [s, n] = process.hrtime(t);
  return (s * 1000) + n / 1000 / 1000;
}

async function benchmark() {
  let t = 10;
  let benchmarks = { saxWasm: [], nodeXml: [], saxes: [], sax: [], expat: [], ltx: [] };
  while (t--) {
    benchmarks.saxWasm.push(await benchmarkSaxWasmParser());
    benchmarks.nodeXml.push(await benchmarkNodeXmlParser());
    benchmarks.saxes.push(await benchmarkSaxesParser());
    benchmarks.sax.push(await benchmarkSaxParser());
    benchmarks.expat.push(await benchmarkExpatParser());
    benchmarks.ltx.push(await benchmarkLtxParser());
  }
  return benchmarks;
}

benchmark().then(benchmarks => {
  const { saxWasm, nodeXml, saxes, sax, expat, ltx } = benchmarks;
  process.stdout.write(Buffer.from(`sax-wasm: ${saxWasm.reduce((ct = 0, t) => (ct += t)) / saxWasm.length} ms with ${saxWasm.length} runs\n`));
  process.stdout.write(Buffer.from(`ltx: ${ltx.reduce((ct = 0, t) => (ct += t)) / ltx.length} ms with ${ltx.length} runs\n`));
  process.stdout.write(Buffer.from(`saxes: ${saxes.reduce((ct = 0, t) => (ct += t)) / saxes.length} ms with ${saxes.length} runs\n`));
  process.stdout.write(Buffer.from(`expat: ${expat.reduce((ct = 0, t) => (ct += t)) / expat.length} ms with ${expat.length} runs\n`));
  process.stdout.write(Buffer.from(`nodeXml: ${nodeXml.reduce((ct = 0, t) => (ct += t)) / nodeXml.length} ms with ${nodeXml.length} runs\n`));
  process.stdout.write(Buffer.from(`sax: ${sax.reduce((ct = 0, t) => (ct += t)) / sax.length} ms with ${sax.length} runs\n`));
  process.exit(0);
});
