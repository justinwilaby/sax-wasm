import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { SAXParser, SaxEventType, Tag } from '../saxWasm.ts';

const wasm = readFileSync(new URL('../../../lib/sax-wasm.wasm', import.meta.url));

describe('Pooled event descriptor lifetimes', () => {
  it('preserves earlier snapshots after block rollover and memory growth', async () => {
    const parser = new SAXParser(SaxEventType.OpenTag | SaxEventType.CloseTag);
    await parser.prepareWasm(wasm);
    const tags: Tag[] = [];
    parser.eventHandler = (_, detail) => tags.push(detail as Tag);
    const children = Array.from({ length: 3000 }, (_, i) => `<child id="${i}">text${i}</child>`).join('');
    parser.write(Buffer.from(`<root title="café 🚀">before${children}after</root>`));
    parser.wasmSaxParser.memory.grow(1);

    // Decode only after every event has been stored and the JS memory view expired.
    assert.strictEqual(tags.length, 6002);
    const rootOpen = tags[0];
    const rootClose = tags.at(-1);
    assert.strictEqual(rootOpen.attributes[0].value.value, 'café 🚀');
    assert.deepStrictEqual({ ...rootOpen.closeEnd }, { line: 0, character: 0 });
    assert.deepStrictEqual(rootOpen.textNodes, []);
    assert.deepStrictEqual(rootClose.textNodes.map(text => text.value), ['before', 'after']);
    for (let i = 0; i < 3000; i++) {
      const open = tags[1 + 2 * i];
      const close = tags[2 + 2 * i];
      assert.strictEqual(open.name, 'child');
      assert.strictEqual(open.attributes[0].value.value, String(i));
      assert.deepStrictEqual(open.textNodes, []);
      assert.strictEqual(close.attributes[0].value.value, String(i));
      assert.strictEqual(close.textNodes[0].value, `text${i}`);
    }
    parser.end();
  });

  it('keeps oversized contiguous attribute arrays intact until readers expire', async () => {
    const parser = new SAXParser(SaxEventType.OpenTag | SaxEventType.CloseTag);
    await parser.prepareWasm(wasm);
    const tags: Tag[] = [];
    parser.eventHandler = (_, detail) => tags.push(detail as Tag);
    const attributes = Array.from({ length: 16000 }, (_, i) => ` a${i}="v${i}"`).join('');
    parser.write(Buffer.from(`<root${attributes}></root>`));
    parser.wasmSaxParser.memory.grow(1);
    assert.strictEqual(tags.length, 2);
    for (const tag of tags) {
      assert.strictEqual(tag.attributes.length, 16000);
      for (let i = 0; i < tag.attributes.length; i++) {
        assert.strictEqual(tag.attributes[i].name.value, `a${i}`);
        assert.strictEqual(tag.attributes[i].value.value, `v${i}`);
      }
    }
    parser.end();

    // Readers above have expired; subsequent allocations must use fresh values.
    for (let i = 0; i < 100; i++) {
      tags.length = 0;
      parser.write(Buffer.from(`<next value="${i}"/>`));
      assert.deepStrictEqual(tags.map(tag => tag.attributes[0].value.value), [String(i), String(i)]);
      parser.end();
    }
  });

  it('preserves oversized text arrays and subsequent writes through the async generator', async () => {
    const parser = new SAXParser(SaxEventType.CloseTag);
    await parser.prepareWasm(wasm);
    const input = Buffer.from(`<root>${'<child/>text'.repeat(40000)}</root>`);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(input);
        controller.enqueue(Buffer.from('<next>fresh</next>'));
        controller.close();
      },
    });
    let children = 0;
    let roots = 0;
    let next = 0;
    for await (const [, detail] of parser.parse(stream.getReader())) {
      const tag = detail as Tag;
      if (tag.name === 'child') {
        children++;
      } else if (tag.name === 'root') {
        roots++;
        parser.wasmSaxParser.memory.grow(1);
        assert.strictEqual(tag.textNodes.length, 40000);
        assert.ok(tag.textNodes.every(text => text.value === 'text'));
      } else {
        next++;
        assert.strictEqual(tag.name, 'next');
        assert.deepStrictEqual(tag.textNodes.map(text => text.value), ['fresh']);
      }
    }
    assert.strictEqual(children, 40000);
    assert.strictEqual(roots, 1);
    assert.strictEqual(next, 1);
  });
});
