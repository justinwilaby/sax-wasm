import { createReadStream, readFileSync } from 'fs';
import { URL } from 'url';
import { resolve } from 'path';
import process from 'node:process';
import { Buffer } from 'buffer';

import { SaxEventType, SAXParser } from '../../../lib/esm/index.js';

import nodeXml from 'node-xml';
import expat from 'node-expat';
import sax from 'sax';
import LtxSaxParser from 'ltx/lib/parsers/ltx.js';
import { SaxesParser } from 'saxes'

async function benchmarkSaxWasmParser() {
  const saxWasm = readFileSync(resolve(new URL('../../../lib/sax-wasm.wasm', import.meta.url).pathname));

  const parser = new SAXParser(SaxEventType.Attribute);
  parser.eventHandler = () => void 0;
  await parser.prepareWasm(saxWasm);

  const readable = createReadStream(resolve(new URL('./xml.xml', import.meta.url).pathname));
  let t = process.hrtime();
  await new Promise(resolve => {
    readable.on('data', function (data) {
      parser.write(data);
    });
    readable.once('end', resolve);
  });
  parser.end();
  let [s, n] = process.hrtime(t);
  return (s * 1000) + n / 1000 / 1000;
}

async function benchmarkNodeXmlParser() {
  const parser = new nodeXml.SaxParser(() => void 0);
  const readable = createReadStream(resolve(new URL('./xml.xml', import.meta.url).pathname));
  let t = process.hrtime();
  await new Promise(resolve => {
    readable.on('data', function (data) {
      parser.parseString(data);
    });
    readable.once('end', resolve);
  });
  let [s, n] = process.hrtime(t);
  return (s * 1000) + n / 1000 / 1000;
}

async function benchmarkExpatParser() {
  const parser = new expat.Parser();
  const readable = createReadStream(resolve(new URL('./xml.xml', import.meta.url).pathname));
  let t = process.hrtime();
  await new Promise(resolve => {
      readable.on('data', function (data) {
          parser.parse(data, false);
      });
      readable.once('end', resolve);
  });

  let [s, n] = process.hrtime(t);
  return (s * 1000) + n / 1000 / 1000;
}

async function benchmarkSaxesParser() {
  const parser = new SaxesParser();

  const readable = createReadStream(resolve(new URL('./xml.xml', import.meta.url).pathname), 'utf8');
  let t = process.hrtime();

  await new Promise(resolve => {
    readable.on('data', function (data) {
      parser.write(data);
    });
    readable.once('end', resolve);
  });
  let [s, n] = process.hrtime(t);
  return (s * 1000) + n / 1000 / 1000;
}

async function benchmarkSaxParser() {
  const parser = sax.createStream();
  const readable = createReadStream(resolve(new URL('./xml.xml', import.meta.url).pathname));
  let t = process.hrtime();
  readable.pipe(parser);
  await new Promise(resolve => {
    readable.once('end', resolve);
  });
  let [s, n] = process.hrtime(t);
  return (s * 1000) + n / 1000 / 1000;
}

async function benchmarkLtxParser() {
  const parser = new LtxSaxParser();
  const readable = createReadStream(resolve(new URL('./xml.xml', import.meta.url).pathname));
  let t = process.hrtime();
  await new Promise(resolve => {
    readable.on('data', function (data) {
      parser.write(data);
    });
    readable.once('end', resolve);
  });

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
  process.stdout.write(Buffer.from(`nodeXml: ${nodeXml.reduce((ct = 0, t) => (ct += t)) / nodeXml.length} ms with ${nodeXml.length} runs\n`));
  process.stdout.write(Buffer.from(`saxes: ${saxes.reduce((ct = 0, t) => (ct += t)) / saxes.length} ms with ${saxes.length} runs\n`));
  process.stdout.write(Buffer.from(`sax: ${sax.reduce((ct = 0, t) => (ct += t)) / sax.length} ms with ${sax.length} runs\n`));
  process.stdout.write(Buffer.from(`expat: ${expat.reduce((ct = 0, t) => (ct += t)) / expat.length} ms with ${expat.length} runs\n`));
  process.stdout.write(Buffer.from(`ltx: ${ltx.reduce((ct = 0, t) => (ct += t)) / ltx.length} ms with ${ltx.length} runs\n`));
  process.exit(0);
});
