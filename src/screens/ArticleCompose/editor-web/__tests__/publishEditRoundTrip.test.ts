/**
 * @jest-environment jsdom
 *
 * The "publish, then reopen for editing, then republish without touching
 * anything" property, exercised against one realistic combined document
 * rather than the isolated single-feature probes the rest of the
 * serializer suite already covers - per a colleague review's own
 * suggestion, once the `Toolbar.tsx`/`index.tsx` wiring pass closed out:
 * a span-level facet (underline) over text containing a markdown-special
 * character, a nested block-level facet (arabic typography on a
 * blockquote, not just a bare paragraph), and an HTML-sourced node
 * (image) - the three things multiple review rounds fixed real bugs in
 * this thread, now proven to survive together, in the same document, not
 * just each in its own unit test.
 *
 * Uses the real, shared `manager` (`../manager`) - the exact same
 * instance `AdvancedEditor.tsx` and `bridges/content.ts` use in
 * production - not a parallel test-only fixture, so this is testing the
 * actual pipeline a real publish-then-edit cycle runs, not an
 * approximation of it. That's also why this lives under `editor-web/`
 * rather than `bridges/__tests__/`: `manager` transitively pulls in
 * `bridges/underline.ts` -> the bare `@10play/tentap-editor` root, same
 * `react-native-webview`/`focusListener.tsx` two-layer Jest fix as
 * `editor-web/__tests__/content.test.ts`.
 */
jest.mock('react-native-webview', () => ({}))

import '../serializer/__tests__/_jsdomTextEncoderPolyfill'

import {manager} from '../manager'
import {
  applyFacetsToParsedDoc,
  serializeToMarkdownAndFacets,
} from '../serializer'

describe('publish -> edit -> republish round trip, one document exercising underline+escaping, nested block typography, and an image together', () => {
  it('republishing an unedited document produces byte-identical markdown and facets the second time', () => {
    // Represents what the live editor's own document looks like after a
    // real author: underlines a span containing an asterisk (the exact
    // escaping bug fixed earlier this thread), writes an arabic quote
    // (typography facet nested on a blockquote, not a plain paragraph),
    // and inserts an image (the HTML-sourced node type sanitization/
    // parsing was built around).
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {type: 'text', text: 'price is '},
            {type: 'text', text: '5 * 3', marks: [{type: 'underline'}]},
            {type: 'text', text: ', confirmed.'},
          ],
        },
        {
          type: 'blockquote',
          attrs: {typography: 'arabicQuote', dir: 'rtl'},
          content: [
            {
              type: 'paragraph',
              content: [{type: 'text', text: 'a right-to-left quotation'}],
            },
          ],
        },
        {
          type: 'image',
          attrs: {
            src: 'https://example.com/diagram.png',
            alt: 'a diagram',
            title: null,
            width: null,
            height: null,
          },
        },
      ],
    }

    // Publish.
    const published = serializeToMarkdownAndFacets(manager, doc)
    expect(published.droppedCount).toBe(0)
    // Proves the escaping fix specifically: the underlined span's asterisk
    // is genuinely escaped in the stored markdown, not silently dropped or
    // left to collide with markdown's own emphasis syntax.
    expect(published.markdown).toContain('5 \\* 3')
    expect(published.markdown).toContain('diagram.png')

    // Reopen for editing - the exact `applyFacetsToParsedDoc` call
    // `AdvancedEditor.tsx`'s initial-content load and `ContentBridge`'s
    // `loadMarkdownAndFacets` both actually make in production.
    const reopened = applyFacetsToParsedDoc(
      manager,
      published.markdown,
      published.facets,
    )
    expect(reopened.droppedCount).toBe(0)

    // Republish without having changed anything.
    const republished = serializeToMarkdownAndFacets(manager, reopened.doc)
    expect(republished.droppedCount).toBe(0)

    expect(republished.markdown).toBe(published.markdown)
    expect(republished.facets).toEqual(published.facets)
  })

  it('the underline facet survives at the correct byte range on both sides of the round trip, not just "some" facet surviving', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {type: 'text', text: 'price is '},
            {type: 'text', text: '5 * 3', marks: [{type: 'underline'}]},
            {type: 'text', text: ', confirmed.'},
          ],
        },
      ],
    }
    const published = serializeToMarkdownAndFacets(manager, doc)
    const underlineFacet = published.facets.find(
      f =>
        f.feature.$type ===
        'com.sunnahsky.richtext.facets.formatting#underline',
    )
    expect(underlineFacet).toBeDefined()
    const slice = published.markdown.slice(
      underlineFacet!.byteStart,
      underlineFacet!.byteEnd,
    )
    // The raw, still-escaped slice - proves the byte range points at the
    // literal underlined span, not somewhere else in the string.
    expect(slice).toBe('5 \\* 3')

    const reopened = applyFacetsToParsedDoc(
      manager,
      published.markdown,
      published.facets,
    )
    const underlinedNode = reopened.doc.content?.[0]?.content?.find(n =>
      n.marks?.some(m => m.type === 'underline'),
    )
    expect(underlinedNode?.text).toBe('5 * 3')
  })

  it('the nested blockquote typography facet is still attached to the blockquote, not the inner paragraph, after reopening', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'blockquote',
          attrs: {typography: 'arabicQuote', dir: 'rtl'},
          content: [
            {
              type: 'paragraph',
              content: [{type: 'text', text: 'a right-to-left quotation'}],
            },
          ],
        },
      ],
    }
    const published = serializeToMarkdownAndFacets(manager, doc)
    const typographyFacet = published.facets.find(
      f =>
        f.feature.$type === 'com.sunnahsky.richtext.facets.blocks#typography',
    )
    expect(typographyFacet).toBeDefined()
    expect(typographyFacet?.feature).toMatchObject({value: 'arabicQuote'})

    const reopened = applyFacetsToParsedDoc(
      manager,
      published.markdown,
      published.facets,
    )
    const blockquote = reopened.doc.content?.find(n => n.type === 'blockquote')
    expect(blockquote?.attrs?.typography).toBe('arabicQuote')
  })

  it('the image node survives with its src/alt intact, distinct from the sanitize.test.ts XSS-payload coverage - this is the happy path for legitimate HTML-sourced content', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'image',
          attrs: {
            src: 'https://example.com/diagram.png',
            alt: 'a diagram',
            title: null,
            width: null,
            height: null,
          },
        },
      ],
    }
    const published = serializeToMarkdownAndFacets(manager, doc)
    const reopened = applyFacetsToParsedDoc(
      manager,
      published.markdown,
      published.facets,
    )
    const image = reopened.doc.content?.find(n => n.type === 'image')
    expect(image?.attrs?.src).toBe('https://example.com/diagram.png')
    expect(image?.attrs?.alt).toBe('a diagram')
  })
})
