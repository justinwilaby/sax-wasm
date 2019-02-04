const sax = require("sax");
const {SaxEventType, SAXParser}  = require('../../../lib/');
const parser = sax.parser(true);
const fs = require('fs');
const path = require('path');
const doc = fs.readFileSync(path.resolve(__dirname + '/xml.xml'), {encoding:'utf8'});
const saxWasm = fs.readFileSync(path.resolve(__dirname, '../../../lib/sax-wasm.wasm'));

parser.onopentag = function() {

}

let t = Date.now();
parser.write(doc);
console.log(Date.now() - t);


const wasmParser = new SAXParser(SaxEventType.OpenTagStart);

wasmParser.eventHandler = function (event, data) {

};

wasmParser.prepareWasm(saxWasm).then(() => {
  let t = Date.now();
  wasmParser.write(doc);
  console.log(Date.now() - t);
});
