import { Attribute, readPosition, readU32, SAXParser, SaxEventType, Tag, Text } from '../saxWasm';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('Lazy linear-memory readers', () => {
  it('accepts copied struct bytes while string pointers still refer to Wasm', () => {
    const memory = new WebAssembly.Memory({ initial: 1 });
    const header = new Uint8Array(Attribute.LENGTH + 3).subarray(3);
    const view = new DataView(header.buffer);
    view.setUint32(3 + 12, 512, true);
    view.setUint32(3 + 16, 3, true);
    view.setUint32(3 + Text.LENGTH + 12, 600, true);
    view.setUint32(3 + Text.LENGTH + 16, 5, true);
    new Uint8Array(memory.buffer, 512, 3).set(new TextEncoder().encode('key'));
    new Uint8Array(memory.buffer, 600, 5).set(new TextEncoder().encode('value'));
    const attribute = new Attribute(header, memory);
    memory.grow(1);
    expect(attribute.name.value).toBe('key');
    expect(attribute.value.value).toBe('value');
  });

  it('refreshes struct and string views after memory grows', () => {
    const memory = new WebAssembly.Memory({ initial: 1 });
    const data = new Uint8Array(memory.buffer, 128, Text.LENGTH);
    const view = new DataView(memory.buffer);
    view.setUint32(128 + 12, 512, true);
    view.setUint32(128 + 16, 5, true);
    view.setUint32(128 + 24, 7, true);
    view.setUint32(128 + 40, 9, true);
    view.setUint32(128 + 44, 1, true);
    view.setUint32(128 + 56, 11, true);
    view.setUint32(128 + 60, 2, true);
    new Uint8Array(memory.buffer, 512, 5).set(new TextEncoder().encode('hello'));
    const text = new Text(data, memory);
    expect(text.start.line).toBe(7);
    const oldStringView = text.dataView;
    memory.grow(1);
    expect(oldStringView.byteLength).toBe(0);
    expect(text.end.line).toBe(0x1_0000_0000 + 9);
    expect(text.byteOffsets.start).toBe(2 * 0x1_0000_0000 + 11);
    expect(text.value).toBe('hello');
    expect(text.dataView.buffer).toBe(memory.buffer);
  });

  it('shares whole-memory views and creates nested readers lazily', () => {
    const memory = new WebAssembly.Memory({ initial: 1 });
    const attribute = new Attribute(new Uint8Array(memory.buffer, 128, Attribute.LENGTH), memory);
    const text = new Text(new Uint8Array(memory.buffer, 512, Text.LENGTH), memory);
    expect(attribute.dataView).toBe(text.dataView);
    memory.grow(1);
    expect(attribute.name.value).toBe('');
    expect(attribute.value.value).toBe('');
    expect(attribute.name).toBe(attribute.name);
    expect(attribute.dataView).toBe(text.dataView);
  });

  it('reads shared-memory growth and unaligned integer fields', () => {
    const memory = new WebAssembly.Memory({ initial: 1, maximum: 3, shared: true });
    const text = new Text(128, memory);
    const before = text.dataView;
    memory.grow(1);
    expect(text.dataView.byteLength).toBe(2 * 65536);
    expect(text.dataView).not.toBe(before);
    const bytes = new Uint8Array(memory.buffer, 3, 24);
    const view = new DataView(memory.buffer);
    view.setUint32(3, 0xfedcba98, true);
    view.setUint32(7, 1, true);
    view.setUint32(11, 23, true);
    expect(readU32(bytes, 0)).toBe(0xfedcba98);
    expect(readPosition(bytes).line).toBe(0x1_0000_0000 + 0xfedcba98);
    expect(readPosition(bytes).character).toBe(23);
  });

  it('keeps self-closing event details readable throughout the write', async () => {
    const parser = new SAXParser(SaxEventType.OpenTag | SaxEventType.CloseTag | SaxEventType.Attribute);
    await parser.prepareWasm(readFileSync(resolve(__dirname, '../../../lib/sax-wasm.wasm')));
    const retained: Array<[number, Tag | Attribute]> = [];
    parser.eventHandler = (event, detail) => retained.push([event, detail as Tag | Attribute]);
    parser.write(new TextEncoder().encode('<root><child key="value"/><child key="other"/></root>'));
    const tags = retained.filter(([event]) => event === SaxEventType.OpenTag || event === SaxEventType.CloseTag).map(([, detail]) => detail as Tag);
    expect(tags.map(tag => tag.name)).toEqual(['root', 'child', 'child', 'child', 'child', 'root']);
    expect(tags[1].attributes[0].value.value).toBe('value');
    expect(tags[2].attributes[0].value.value).toBe('value');
    expect(tags[3].attributes[0].value.value).toBe('other');
    expect(tags[4].attributes[0].value.value).toBe('other');
    parser.end();
  });
});
