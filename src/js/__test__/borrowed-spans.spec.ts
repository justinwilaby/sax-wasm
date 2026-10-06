import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { Attribute, ProcInst, SAXParser, SaxEventType, Tag, Text } from '../saxWasm.ts';

const wasm = readFileSync(new URL('../../../lib/sax-wasm.wasm', import.meta.url));
const encoder = new TextEncoder();
const pointer = (reader: Text | Tag): number => (reader as unknown as { pointer: number }).pointer;
const valuePointer = (reader: Text | Tag, parser: SAXParser): number => new DataView(parser.wasmSaxParser.memory.buffer).getUint32(pointer(reader), true);

describe('Versioned borrowed event descriptors', () => {
  it('rejects missing and unsupported ABI versions before exposing an instance', async () => {
    const parser = new SAXParser();
    const empty = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]);
    await assert.rejects(parser.prepareWasm(empty), /version: missing; expected 1/);
    assert.strictEqual(parser.wasmSaxParser, undefined);
    const name = encoder.encode('event_abi_version');
    const section = (id: number, bytes: number[]) => [id, bytes.length, ...bytes];
    const unsupported = new Uint8Array([
      ...empty,
      ...section(1, [1, 0x60, 0, 1, 0x7f]),
      ...section(3, [1, 0]),
      ...section(7, [1, name.length, ...name, 0, 0]),
      ...section(10, [1, 4, 0, 0x41, 2, 0x0b]),
    ]);
    await assert.rejects(parser.prepareWasm(unsupported), /version: 2; expected 1/);
    assert.strictEqual(parser.wasmSaxParser, undefined);
  });

  for (const closeInitially of [true, false]) it(`applies callback subscription changes to the next self-closing tag (close initially ${closeInitially})`, async () => {
    const parser = new SAXParser(SaxEventType.OpenTag | (closeInitially ? SaxEventType.CloseTag : 0));
    await parser.prepareWasm(wasm);
    const events: SaxEventType[] = [];
    parser.eventHandler = (event) => {
      events.push(event);
      if (event === SaxEventType.OpenTag) {
        parser.events = SaxEventType.OpenTag | (closeInitially ? 0 : SaxEventType.CloseTag);
      }
    };
    parser.write(encoder.encode('<item/><next/>'));
    assert.deepStrictEqual(events, closeInitially
      ? [SaxEventType.OpenTag, SaxEventType.CloseTag, SaxEventType.OpenTag]
      : [SaxEventType.OpenTag, SaxEventType.OpenTag, SaxEventType.CloseTag]);
    parser.end();
  });

  it('borrows complete comments, CDATA, doctypes and processing instructions', async () => {
    const parser = new SAXParser(SaxEventType.Comment | SaxEventType.Cdata | SaxEventType.Doctype | SaxEventType.ProcessingInstruction);
    await parser.prepareWasm(wasm);
    const input = Buffer.from('<?target content?><!DOCTYPE root><root><!--a>b--><![CDATA[c>d]]><![CDATA[]]></root>');
    const instructions: ProcInst[] = [];
    const texts: Text[] = [];
    parser.eventHandler = (event, detail) => {
      if (event === SaxEventType.ProcessingInstruction) instructions.push(detail as ProcInst);
      else texts.push(detail as Text);
    };
    parser.write(input);
    assert.strictEqual(instructions[0].target.value, 'target');
    assert.strictEqual(instructions[0].content.value, 'content');
    assert.strictEqual(valuePointer(instructions[0].target, parser), 4 + input.indexOf('target'));
    assert.strictEqual(valuePointer(instructions[0].content, parser), 4 + input.indexOf('content'));
    assert.deepStrictEqual(texts.map(text => text.value), ['root', 'a>b', 'c>d', '']);
    assert.strictEqual(valuePointer(texts[0], parser), 4 + input.indexOf('root'));
    assert.strictEqual(valuePointer(texts[1], parser), 4 + input.indexOf('a>b'));
    assert.strictEqual(valuePointer(texts[2], parser), 4 + input.indexOf('c>d'));
    parser.end();
  });

  it('points completed names, attribute values and text directly into this write', async () => {
    const parser = new SAXParser(SaxEventType.OpenTag | SaxEventType.CloseTag | SaxEventType.Text | SaxEventType.Attribute);
    await parser.prepareWasm(wasm);
    assert.strictEqual(parser.wasmSaxParser.event_abi_version(), 1);
    const input = Buffer.from('<root title="café 🚀">content<child key="value"/></root>');
    const tags: Tag[] = [];
    const attributes: Attribute[] = [];
    const texts: Text[] = [];
    parser.eventHandler = (event, detail) => {
      if (event === SaxEventType.OpenTag || event === SaxEventType.CloseTag) tags.push(detail as Tag);
      if (event === SaxEventType.Attribute) attributes.push(detail as Attribute);
      if (event === SaxEventType.Text) texts.push(detail as Text);
    };
    parser.write(input);
    // Read after the complete write, when parser-owned tags have been popped
    // or hydrated and descriptor bookkeeping vectors have grown.
    assert.strictEqual(valuePointer(tags[0], parser), 4 + input.indexOf('root'));
    assert.strictEqual(valuePointer(attributes[0].name, parser), 4 + input.indexOf('title'));
    assert.strictEqual(valuePointer(attributes[0].value, parser), 4 + input.indexOf('café 🚀'));
    assert.strictEqual(valuePointer(texts[0], parser), 4 + input.indexOf('content'));
    assert.strictEqual(tags[0].name, 'root');
    assert.deepStrictEqual({ ...tags[0].closeEnd }, { line: 0, character: 0 });
    assert.strictEqual(attributes[0].value.value, 'café 🚀');
    assert.strictEqual(texts[0].value, 'content');
    assert.strictEqual(tags.at(-1).textNodes[0].value, 'content');
    parser.end();
  });

  it('owns completed values accumulated across writes', async () => {
    const parser = new SAXParser(SaxEventType.Attribute | SaxEventType.Text);
    await parser.prepareWasm(wasm);
    const attributes: Attribute[] = [];
    const texts: Text[] = [];
    parser.eventHandler = (event, detail) => {
      if (event === SaxEventType.Attribute) attributes.push(detail as Attribute);
      if (event === SaxEventType.Text) texts.push(detail as Text);
    };
    parser.write(encoder.encode('<root title="abc'));
    const tail = encoder.encode('def">partial');
    parser.write(tail);
    assert.strictEqual(attributes[0].value.value, 'abcdef');
    assert.ok(valuePointer(attributes[0].value, parser) > 4 + tail.length);
    parser.write(encoder.encode(' text<child/></root>'));
    assert.strictEqual(texts[0].value, 'partial text');
    assert.ok(valuePointer(texts[0], parser) > 4 + 24);
    parser.end();
  });

  it('keeps combined input for a split UTF-8 code point alive after write returns', async () => {
    const parser = new SAXParser(SaxEventType.Text | SaxEventType.CloseTag);
    await parser.prepareWasm(wasm);
    const input = Buffer.from('<root>🚀suffix<leaf/>tail</root>');
    const texts: Text[] = [];
    parser.eventHandler = (event, detail) => {
      if (event === SaxEventType.Text) texts.push(detail as Text);
    };
    parser.write(input.subarray(0, 8)); // two bytes of the four-byte code point
    parser.write(input.subarray(8));
    parser.wasmSaxParser.memory.grow(1);
    assert.deepStrictEqual(texts.map(text => text.value), ['🚀suffix', 'tail']);
    parser.end();
  });

  it('preserves deferred reads through descriptor growth and Wasm memory growth', async () => {
    const parser = new SAXParser(SaxEventType.OpenTag | SaxEventType.CloseTag | SaxEventType.Attribute | SaxEventType.Text);
    await parser.prepareWasm(wasm);
    const originalBuffer = parser.wasmSaxParser.memory.buffer;
    const input = encoder.encode(`<root>${'<item key="value">text</item>'.repeat(5000)}</root>`);
    const tags: Tag[] = [];
    const attributes: Attribute[] = [];
    const texts: Text[] = [];
    parser.eventHandler = (event, detail) => {
      if (event === SaxEventType.OpenTag || event === SaxEventType.CloseTag) tags.push(detail as Tag);
      if (event === SaxEventType.Attribute) attributes.push(detail as Attribute);
      if (event === SaxEventType.Text) texts.push(detail as Text);
    };
    parser.write(input);
    assert.notStrictEqual(parser.wasmSaxParser.memory.buffer, originalBuffer);
    assert.strictEqual(tags.length, 10002);
    assert.strictEqual(tags[0].name, 'root');
    assert.deepStrictEqual({ ...tags[0].closeEnd }, { line: 0, character: 0 });
    assert.strictEqual(tags[1].attributes[0].value.value, 'value');
    assert.strictEqual(tags.at(-1).name, 'root');
    assert.strictEqual(attributes[0].name.value, 'key');
    assert.strictEqual(attributes.at(-1).value.value, 'value');
    assert.strictEqual(texts[0].value, 'text');
    assert.strictEqual(texts.at(-1).value, 'text');
    parser.end();
  });
});
