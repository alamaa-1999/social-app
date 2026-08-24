/**
 * Side-effect-only polyfill, imported first (multiple `import` statements
 * run in the order they're written, even though all of them run before any
 * non-import code) - Jest's `jsdom` test environment doesn't carry over a
 * `TextEncoder`/`TextDecoder`, which `state.ts` calls at module load time
 * (`const encoder = new TextEncoder()`), so importing anything that
 * transitively reaches `state.ts` crashes immediately under
 * `@jest-environment jsdom` without this.
 *
 * Deliberately NOT Node's own `node:util` `TextEncoder`/`TextDecoder`,
 * even though that's the obvious first thing to reach for - confirmed
 * directly, not assumed, that it silently breaks under jsdom: `util.
 * TextEncoder.encode()` produces a `Uint8Array` that fails `instanceof
 * Uint8Array` inside jsdom's own realm (jsdom runs its own separate global
 * scope, with its own `Uint8Array` constructor, distinct from Node's),
 * and `util.TextDecoder.decode()` on that array returns an empty string
 * *silently* rather than throwing - a real, easy-to-miss footgun for
 * exactly this cross-realm combination. `Buffer` (a genuine Node global,
 * not overridden by jsdom) is duck-typed/realm-agnostic and decodes it
 * correctly, so this polyfill is built on `Buffer` instead of borrowing
 * Node's `util` classes directly.
 *
 * Deliberately unconditional, not `if (typeof globalThis.TextEncoder ===
 * 'undefined')`: confirmed directly that this Jest jsdom environment
 * *already* provides some `TextEncoder`/`TextDecoder` before this file
 * ever runs (`typeof TextEncoder === 'function'` is true even without
 * this file), and that pre-existing pair is the exact one exhibiting the
 * cross-realm bug above - an existence check alone would silently skip
 * ever installing the fix.
 */

class BufferBackedTextEncoder {
  encode(input = ''): Uint8Array {
    return new Uint8Array(Buffer.from(input, 'utf-8'))
  }
}

class BufferBackedTextDecoder {
  decode(input?: ArrayBufferView | ArrayBuffer): string {
    if (!input) return ''
    return Buffer.from(input as ArrayBufferLike).toString('utf-8')
  }
}

// @ts-expect-error - narrower than the full DOM TextEncoder interface,
// sufficient for this test suite's own plain UTF-8 encode/decode needs.
globalThis.TextEncoder = BufferBackedTextEncoder
// @ts-expect-error - same as above.
globalThis.TextDecoder = BufferBackedTextDecoder
