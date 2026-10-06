import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Attribute, ProcInst, SAXParser, SaxEventType, Tag, Text } from '../saxWasm';

const wasm = readFileSync(resolve(__dirname, '../../../lib/sax-wasm.wasm'));
const encoder = new TextEncoder();
const pointer = (reader: Text | Tag): number => (reader as unknown as { pointer: number }).pointer;
const valuePointer = (reader: Text | Tag, parser: SAXParser): number => new DataView(parser.wasmSaxParser.memory.buffer).getUint32(pointer(reader), true);

describe('Versioned borrowed event descriptors', () => {
  it('rejects missing and unsupported ABI versions before exposing an instance', async () => {
    const parser = new SAXParser();
    const empty = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]);
    await expect(parser.prepareWasm(empty)).rejects.toThrow('version: missing; expected 1');
    expect(parser.wasmSaxParser).toBeUndefined();
    const name = encoder.encode('event_abi_version');
    const section = (id: number, bytes: number[]) => [id, bytes.length, ...bytes];
    const unsupported = new Uint8Array([
      ...empty,
      ...section(1, [1, 0x60, 0, 1, 0x7f]),
      ...section(3, [1, 0]),
      ...section(7, [1, name.length, ...name, 0, 0]),
      ...section(10, [1, 4, 0, 0x41, 2, 0x0b]),
    ]);
    await expect(parser.prepareWasm(unsupported)).rejects.toThrow('version: 2; expected 1');
    expect(parser.wasmSaxParser).toBeUndefined();
  });

  it.each([true, false])('applies callback subscription changes to the next self-closing tag (close initially %s)', async (closeInitially) => {
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
    expect(events).toEqual(closeInitially
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
    expect(instructions[0].target.value).toBe('target');
    expect(instructions[0].content.value).toBe('content');
    expect(valuePointer(instructions[0].target, parser)).toBe(4 + input.indexOf('target'));
    expect(valuePointer(instructions[0].content, parser)).toBe(4 + input.indexOf('content'));
    expect(texts.map(text => text.value)).toEqual(['root', 'a>b', 'c>d', '']);
    expect(valuePointer(texts[0], parser)).toBe(4 + input.indexOf('root'));
    expect(valuePointer(texts[1], parser)).toBe(4 + input.indexOf('a>b'));
    expect(valuePointer(texts[2], parser)).toBe(4 + input.indexOf('c>d'));
    parser.end();
  });

  it('points completed names, attribute values and text directly into this write', async () => {
    const parser = new SAXParser(SaxEventType.OpenTag | SaxEventType.CloseTag | SaxEventType.Text | SaxEventType.Attribute);
    await parser.prepareWasm(wasm);
    expect(parser.wasmSaxParser.event_abi_version()).toBe(1);
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
    expect(valuePointer(tags[0], parser)).toBe(4 + input.indexOf('root'));
    expect(valuePointer(attributes[0].name, parser)).toBe(4 + input.indexOf('title'));
    expect(valuePointer(attributes[0].value, parser)).toBe(4 + input.indexOf('café 🚀'));
    expect(valuePointer(texts[0], parser)).toBe(4 + input.indexOf('content'));
    expect(tags[0].name).toBe('root');
    expect(tags[0].closeEnd).toEqual({ line: 0, character: 0 });
    expect(attributes[0].value.value).toBe('café 🚀');
    expect(texts[0].value).toBe('content');
    expect(tags.at(-1).textNodes[0].value).toBe('content');
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
    expect(attributes[0].value.value).toBe('abcdef');
    expect(valuePointer(attributes[0].value, parser)).toBeGreaterThan(4 + tail.length);
    parser.write(encoder.encode(' text<child/></root>'));
    expect(texts[0].value).toBe('partial text');
    expect(valuePointer(texts[0], parser)).toBeGreaterThan(4 + 24);
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
    expect(texts.map(text => text.value)).toEqual(['🚀suffix', 'tail']);
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
    expect(parser.wasmSaxParser.memory.buffer).not.toBe(originalBuffer);
    expect(tags.length).toBe(10002);
    expect(tags[0].name).toBe('root');
    expect(tags[0].closeEnd).toEqual({ line: 0, character: 0 });
    expect(tags[1].attributes[0].value.value).toBe('value');
    expect(tags.at(-1).name).toBe('root');
    expect(attributes[0].name.value).toBe('key');
    expect(attributes.at(-1).value.value).toBe('value');
    expect(texts[0].value).toBe('text');
    expect(texts.at(-1).value).toBe('text');
    parser.end();
  });
});
