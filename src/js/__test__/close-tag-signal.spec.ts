import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { SAXParser, SaxEventType, Tag } from '../saxWasm.ts';

const wasm = readFileSync(new URL('../../../lib/sax-wasm.wasm', import.meta.url));
const { OpenTag, CloseTag, CloseTagSignal, Comment } = SaxEventType;

async function createParser(events: number) {
  const parser = new SAXParser(events);
  await parser.prepareWasm(wasm);
  return parser;
}

describe('CloseTagSignal', () => {
  it('uses a null descriptor and undefined detail for every close notification', async () => {
    const parser = new SAXParser(CloseTagSignal);
    const trap = parser.eventTrap;
    let calls = 0;
    parser.eventTrap = (event, pointer) => {
      assert.strictEqual(event, CloseTagSignal);
      assert.strictEqual(pointer, 0);
      calls++;
      trap(event, pointer);
    };
    parser.eventHandler = (event, detail) => {
      assert.strictEqual(event, CloseTagSignal);
      assert.strictEqual(detail, undefined);
    };
    await parser.prepareWasm(wasm);
    assert.strictEqual(parser.wasmSaxParser.close_tag_signal_version(), 1);
    parser.write(Buffer.from('<root><self/><child>text</child></root>'));
    parser.end();
    assert.strictEqual(calls, 3);
  });

  for (const chunkSize of [1, 7, 64, 65536]) {
    it(`matches full close ordering and remaining payloads with ${chunkSize}-byte writes`, async () => {
      const input = Buffer.from('<root a="café 🚀"><!--note--><child b="日本語"/><a><b></a></root></orphan><unfinished>');
      const traces: unknown[][] = [];
      for (const close of [CloseTag, CloseTagSignal]) {
        const parser = await createParser(OpenTag | close | Comment);
        const trace: unknown[] = [];
        parser.eventHandler = (event, detail) => {
          trace.push(event === close ? [CloseTag] : [event, detail.toJSON()]);
        };
        for (let at = 0; at < input.length; at += chunkSize) {
          parser.write(input.subarray(at, at + chunkSize));
        }
        parser.end();
        traces.push(trace);
      }
      assert.deepStrictEqual(traces[1], traces[0]);
    });
  }

  it('orders full close events before signals, including implicit and self-closing tags', async () => {
    const parser = await createParser(OpenTag | CloseTag | CloseTagSignal);
    const events: number[] = [];
    parser.eventHandler = event => events.push(event);
    parser.write(Buffer.from('<root><a><b/></root>'));
    parser.end();
    assert.deepStrictEqual(events, [
      OpenTag, OpenTag, OpenTag, CloseTag, CloseTagSignal,
      CloseTag, CloseTagSignal, CloseTag, CloseTagSignal,
    ]);
  });

  for (const initiallySignal of [false, true]) {
    it(`applies self-closing callback changes to subsequent tags (signal initially ${initiallySignal})`, async () => {
      const parser = await createParser(OpenTag | (initiallySignal ? CloseTagSignal : 0));
      const events: number[] = [];
      parser.eventHandler = event => {
        events.push(event);
        if (event === OpenTag) parser.events ^= CloseTagSignal;
      };
      parser.write(Buffer.from('<first/><second/>'));
      parser.end();
      assert.deepStrictEqual(events, initiallySignal
        ? [OpenTag, CloseTagSignal, OpenTag]
        : [OpenTag, OpenTag, CloseTagSignal]);
    });
  }

  it('captures subscriptions for the whole group of implicit closes', async () => {
    const parser = await createParser(CloseTag | CloseTagSignal);
    const events: number[] = [];
    parser.eventHandler = event => {
      events.push(event);
      parser.events = 0;
    };
    parser.write(Buffer.from('<root><child></root><next/>'));
    parser.end();
    assert.deepStrictEqual(events, [CloseTag, CloseTagSignal, CloseTag, CloseTagSignal]);
  });

  it('retains attributes and text when a later write enables full close events', async () => {
    const parser = await createParser(CloseTagSignal);
    let closed: Tag;
    const events: number[] = [];
    parser.eventHandler = (event, detail) => {
      events.push(event);
      if (event === CloseTag) closed = detail as Tag;
    };
    parser.write(Buffer.from('<root a="split'));
    parser.write(Buffer.from(' value">before'));
    parser.events |= CloseTag;
    parser.write(Buffer.from('after</root>'));
    assert.strictEqual(closed.name, 'root');
    assert.strictEqual(closed.attributes[0].value.value, 'split value');
    assert.strictEqual(closed.textNodes.map(text => text.value).join(''), 'beforeafter');
    assert.deepStrictEqual(events, [CloseTag, CloseTagSignal]);
    parser.end();
  });

  it('preserves deferred open payloads and signal tuples through the async generator', async () => {
    const parser = await createParser(OpenTag | CloseTagSignal);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Buffer.from('<root a="one"><child b="two"/></root>'));
        controller.close();
      },
    });
    const result: unknown[] = [];
    for await (const [event, detail] of parser.parse(stream.getReader())) {
      parser.wasmSaxParser.memory.grow(1);
      if (event === CloseTagSignal) {
        assert.strictEqual(detail, undefined);
        result.push('close');
      } else {
        const tag = detail as Tag;
        result.push([tag.name, tag.attributes[0].value.value]);
      }
    }
    assert.deepStrictEqual(result, [['root', 'one'], ['child', 'two'], 'close', 'close']);
  });

  it('works without a handler and resets for later documents', async () => {
    const parser = await createParser(CloseTagSignal);
    parser.write(Buffer.from('<root/>'));
    parser.end();
    let count = 0;
    parser.eventHandler = () => count++;
    for (let i = 0; i < 10; i++) {
      parser.write(Buffer.from('<root><child/></root>'));
      parser.end();
    }
    assert.strictEqual(count, 20);
  });

  it('rejects an old ABI-1 module only when signal support is requested', async () => {
    // Minimal real module with ABI 1 and parser(events), but no signal capability.
    const abi = Buffer.from('event_abi_version');
    const parserName = Buffer.from('parser');
    const section = (id: number, bytes: number[]) => [id, bytes.length, ...bytes];
    const oldWasm = new Uint8Array([
      0, 97, 115, 109, 1, 0, 0, 0,
      ...section(1, [2, 0x60, 0, 1, 0x7f, 0x60, 1, 0x7f, 0]),
      ...section(3, [2, 0, 1]),
      ...section(7, [2, abi.length, ...abi, 0, 0, parserName.length, ...parserName, 0, 1]),
      ...section(10, [2, 4, 0, 0x41, 1, 0x0b, 2, 0, 0x0b]),
    ]);
    const signalParser = new SAXParser(CloseTagSignal);
    await assert.rejects(signalParser.prepareWasm(oldWasm), /does not support CloseTagSignal/);
    assert.strictEqual(signalParser.wasmSaxParser, undefined);
    const legacyParser = new SAXParser(OpenTag);
    assert.strictEqual(await legacyParser.prepareWasm(oldWasm), true);
    assert.throws(() => legacyParser.events |= CloseTagSignal, /does not support CloseTagSignal/);
    assert.strictEqual(legacyParser.events, OpenTag);
    legacyParser.events = CloseTag;
    assert.strictEqual(legacyParser.events, CloseTag);
  });
});
