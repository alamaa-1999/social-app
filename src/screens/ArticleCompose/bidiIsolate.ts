import {Mark} from '@tiptap/core'

/**
 * Wraps a run of text whose bidi direction must not leak into - or be
 * disturbed by - the text around it. Currently applied to honorific glyphs
 * (see `bridges/honorific.ts` for insertion and
 * `editor-web/serializer/index.ts` for load-time re-derivation).
 *
 * Lives in its own module, apart from the bridge that inserts it, because
 * the mark is a *schema* concern with three separate consumers - the
 * bridge, the shared `MarkdownManager` (`editor-web/manager.ts`), and the
 * serializer's own test suite - while the bridge is a messaging concern
 * that only the editor itself needs. Keeping them apart lets the
 * markdown/serializer side register the exact same mark object the real
 * editor uses without depending on the bridge module at all, so the test
 * fixture can mirror production instead of approximating it.
 *
 * Deliberately carries no attributes: the isolation is expressed purely by
 * the `data-bidi-isolate` presence selector in `editor-web/index.html`, so
 * there is no free-form value to validate and nothing for
 * `serializer/sanitize.ts`'s attribute allowlist to have to cover.
 */
export const bidiIsolateMark = Mark.create({
  name: 'bidiIsolate',
  parseHTML() {
    return [{tag: 'span[data-bidi-isolate]'}]
  },
  renderHTML() {
    return ['span', {'data-bidi-isolate': ''}, 0]
  },
})
