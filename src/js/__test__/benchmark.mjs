import { createReadStream, readFileSync } from 'fs';
import { URL } from 'url';
import { resolve } from 'path';
import process from 'node:process';
import { Buffer } from 'buffer';

import { SaxEventType, SAXParser } from '../../../lib/cjs/index.js';

import nodeXml from 'node-xml';
// import libxml from 'libxmljs';
// import expat from 'node-expat';
import sax from 'sax';
import LtxSaxParser from 'ltx/lib/parsers/ltx.js';
import { Readable } from 'node:stream';

async function benchmarkSaxWasmParser() {
    const saxWasm = readFileSync(resolve(new URL('../../../lib/sax-wasm.wasm', import.meta.url).pathname));

    const parser = new SAXParser(SaxEventType.OpenTag, {highWaterMark: 64 * 1024});
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

// async function benchmarkLibXmlJsParser() {
//     const parser = new libxml.SaxPushParser();
//     parser.on('startElement', () => void 0);
//     const readable = createReadStream(resolve(new URL('./xml.xml', import.meta.url).pathname));
//     let t = process.hrtime();
//     await new Promise(resolve => {
//         readable.on('data', function (data) {
//             parser.push(data.toString(), false);
//         });
//         readable.once('end', resolve);
//     });
//     let [s, n] = process.hrtime(t);
//     return (s * 1000) + n / 1000 / 1000;
// }

async function benchmarkSaxParser() {
    const parser = sax.createStream();
    parser.onopentag = () => void 0;
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
    parser.on('startElement', () => void 0);
    const data = readFileSync(resolve(new URL('./xml.xml', import.meta.url).pathname));
    let t = process.hrtime();
    parser.write(data.toString(), false);
    let [s, n] = process.hrtime(t);
    return (s * 1000) + n / 1000 / 1000;
}

async function benchmark() {
    let t = 10;
    let benchmarks = {saxWasm: [], nodeXml: [], libXml: [], sax: [], expat: [], ltx: []};
    while (t--) {
        benchmarks.saxWasm.push(await benchmarkSaxWasmParser());
        benchmarks.nodeXml.push(await benchmarkNodeXmlParser());
        // benchmarks.libXml.push(await benchmarkLibXmlJsParser());
        benchmarks.sax.push(await benchmarkSaxParser());
        // benchmarks.expat.push(await benchmarkExpatParser());
        benchmarks.ltx.push(await benchmarkLtxParser());
    }
    return benchmarks;
}

benchmark().then(benchmarks => {
    const {saxWasm, nodeXml, libXml, sax, expat, ltx} = benchmarks;
    process.stdout.write(Buffer.from(`sax-wasm: ${saxWasm.reduce((ct = 0, t) => (ct += t)) / saxWasm.length} ms with ${saxWasm.length} runs\n`));
    process.stdout.write(Buffer.from(`nodeXml: ${nodeXml.reduce((ct = 0, t) => (ct += t)) / nodeXml.length} ms with ${nodeXml.length} runs\n`));
    // process.stdout.write(Buffer.from(`libXml: ${libXml.reduce((ct = 0, t) => (ct += t)) / libXml.length} ms with ${libXml.length} runs\n`));
    process.stdout.write(Buffer.from(`sax: ${sax.reduce((ct = 0, t) => (ct += t)) / sax.length} ms with ${sax.length} runs\n`));
    // process.stdout.write(Buffer.from(`expat: ${expat.reduce((ct = 0, t) => (ct += t)) / expat.length} ms with ${expat.length} runs\n`));
    process.stdout.write(Buffer.from(`ltx: ${ltx.reduce((ct = 0, t) => (ct += t)) / ltx.length} ms with ${ltx.length} runs\n`));
    process.exit(0);
});
