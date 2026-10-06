import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Attribute, readPosition, readU32, SAXParser, SaxEventType, Tag, Text } from '../saxWasm.ts';
import { readFileSync } from 'fs';

describe('Lazy linear-memory readers', () => {
  it('requires numeric pointers instead of copied struct bytes', () => {
    const memory = new WebAssembly.Memory({ initial: 1 });
    assert.throws(() => new Attribute(new Uint8Array(Attribute.LENGTH) as unknown as number, memory), TypeError);
  });

  it('refreshes struct and string views after memory grows', () => {
    const memory = new WebAssembly.Memory({ initial: 1 });
    const view = new DataView(memory.buffer);
    view.setUint32(128, 512, true);
    view.setUint32(128 + 4, 5, true);
    view.setUint32(128 + 8, 7, true);
    view.setUint32(128 + 24, 9, true);
    view.setUint32(128 + 28, 1, true);
    view.setUint32(128 + 40, 11, true);
    view.setUint32(128 + 44, 2, true);
    new Uint8Array(memory.buffer, 512, 5).set(new TextEncoder().encode('hello'));
    const text = new Text(128, memory);
    assert.strictEqual(text.start.line, 7);
    const oldStringView = text.dataView;
    memory.grow(1);
    assert.strictEqual(oldStringView.byteLength, 0);
    assert.strictEqual(text.end.line, 0x1_0000_0000 + 9);
    assert.strictEqual(text.byteOffsets.start, 2 * 0x1_0000_0000 + 11);
    assert.strictEqual(text.value, 'hello');
    assert.strictEqual(text.dataView.buffer, memory.buffer);
  });

  it('shares whole-memory views and creates nested readers lazily', () => {
    const memory = new WebAssembly.Memory({ initial: 1 });
    const attribute = new Attribute(128, memory);
    const text = new Text(512, memory);
    assert.strictEqual(attribute.dataView, text.dataView);
    memory.grow(1);
    assert.strictEqual(attribute.name.value, '');
    assert.strictEqual(attribute.value.value, '');
    assert.strictEqual(attribute.name, attribute.name);
    assert.strictEqual(attribute.dataView, text.dataView);
  });

  it('reads shared-memory growth and unaligned integer fields', () => {
    const memory = new WebAssembly.Memory({ initial: 1, maximum: 3, shared: true });
    const text = new Text(128, memory);
    const before = text.dataView;
    memory.grow(1);
    assert.strictEqual(text.dataView.byteLength, 2 * 65536);
    assert.notStrictEqual(text.dataView, before);
    const bytes = new Uint8Array(memory.buffer, 3, 24);
    const view = new DataView(memory.buffer);
    view.setUint32(3, 0xfedcba98, true);
    view.setUint32(7, 1, true);
    view.setUint32(11, 23, true);
    assert.strictEqual(readU32(bytes, 0), 0xfedcba98);
    assert.strictEqual(readPosition(bytes).line, 0x1_0000_0000 + 0xfedcba98);
    assert.strictEqual(readPosition(bytes).character, 23);
  });

  it('keeps self-closing event details readable throughout the write', async () => {
    const parser = new SAXParser(SaxEventType.OpenTag | SaxEventType.CloseTag | SaxEventType.Attribute);
    await parser.prepareWasm(readFileSync(new URL('../../../lib/sax-wasm.wasm', import.meta.url)));
    const retained: Array<[number, Tag | Attribute]> = [];
    parser.eventHandler = (event, detail) => retained.push([event, detail as Tag | Attribute]);
    parser.write(new TextEncoder().encode('<root><child key="value"/><child key="other"/></root>'));
    const tags = retained.filter(([event]) => event === SaxEventType.OpenTag || event === SaxEventType.CloseTag).map(([, detail]) => detail as Tag);
    assert.deepStrictEqual(tags.map(tag => tag.name), ['root', 'child', 'child', 'child', 'child', 'root']);
    assert.strictEqual(tags[1].attributes[0].value.value, 'value');
    assert.strictEqual(tags[2].attributes[0].value.value, 'value');
    assert.strictEqual(tags[3].attributes[0].value.value, 'other');
    assert.strictEqual(tags[4].attributes[0].value.value, 'other');
    parser.end();
  });
});
