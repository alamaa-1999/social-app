/**
 * @jest-environment jsdom
 *
 * Sanitization only does anything meaningful with a real `DOMParser`
 * available - `@tiptap/markdown`'s own `parseHTMLToken` silently falls back
 * to inert literal text whenever `window.DOMParser` is undefined at all
 * (confirmed directly against source: `node_modules/@tiptap/markdown/dist/
 * index.js`'s `parseHTMLToken`), which is Jest's *default* environment for
 * this project. A test written under that default would always take the
 * safe-fallback path regardless of payload, passing for the wrong reason
 * and never exercising the real `generateJSON` code path the actual WebView
 * runtime uses. This file-level `@jest-environment jsdom` override is not
 * optional - it's what makes these tests test anything real at all.
 */
import './_jsdomTextEncoderPolyfill'

import Blockquote from '@tiptap/extension-blockquote'
import Bold from '@tiptap/extension-bold'
import {Color} from '@tiptap/extension-color'
import Heading from '@tiptap/extension-heading'
import Image from '@tiptap/extension-image'
import Italic from '@tiptap/extension-italic'
import Link from '@tiptap/extension-link'
import BulletList from '@tiptap/extension-bullet-list'
import ListItem from '@tiptap/extension-list-item'
import Strike from '@tiptap/extension-strike'
import {TextStyle} from '@tiptap/extension-text-style'
import Underline from '@tiptap/extension-underline'
import {MarkdownManager} from 'tiptap-markdown-fixed'

import Document from 'tiptap-extension-document-fixed'
import Paragraph from 'tiptap-extension-paragraph-fixed'
import Text from 'tiptap-extension-text-fixed'
import {applyFacetsToParsedDoc, serializeToMarkdownAndFacets} from '../index'
import {sanitizeParsedDoc} from '../sanitize'

const PlainUnderline = Underline.extend({
  renderMarkdown(
    node: unknown,
    helpers: {renderChildren: (n: unknown) => string},
  ) {
    return helpers.renderChildren(node)
  },
} as never)

function makeManager() {
  return new MarkdownManager({
    extensions: [
      Document,
      Paragraph,
      Text,
      Bold,
      Italic,
      Strike,
      Blockquote,
      PlainUnderline,
      TextStyle,
      Color,
      Heading,
      Link,
      BulletList,
      ListItem,
      Image,
    ] as never,
  })
}

/** Recursively collects every attrs object anywhere in the doc, node and mark alike. */
function collectAllAttrs(node: {
  attrs?: Record<string, unknown>
  marks?: Array<{attrs?: Record<string, unknown>}>
  content?: unknown[]
}): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = []
  if (node.attrs) out.push(node.attrs)
  node.marks?.forEach(m => {
    if (m.attrs) out.push(m.attrs)
  })
  ;(node.content as (typeof node)[] | undefined)?.forEach(child => {
    out.push(...collectAllAttrs(child))
  })
  return out
}

/** Recursively flattens every text node's content into one string. */
function flattenText(node: {text?: string; content?: unknown[]}): string {
  let out = node.text ?? ''
  ;(node.content as (typeof node)[] | undefined)?.forEach(child => {
    out += flattenText(child)
  })
  return out
}

describe('sanitization on the load path - live against the real generateJSON code path, not the no-DOMParser fallback', () => {
  it('confirms window.DOMParser is actually present in this test environment', () => {
    // If this ever fails, every other test in this file is silently
    // testing the wrong (fallback) code path - see the file header.
    expect(typeof window).toBe('object')
    expect(typeof window.DOMParser).toBe('function')
  })

  it('drops a <script> tag entirely - not executed, not preserved as text or markup', () => {
    const manager = makeManager()
    const {doc} = applyFacetsToParsedDoc(
      manager,
      'before <script>alert(document.cookie)</script> after',
      [],
    )
    const text = flattenText(doc)
    expect(text).not.toContain('script')
    expect(text).not.toContain('alert')
    expect(text).not.toContain('cookie')
  })

  it('never lets an onerror (or any on*) attribute survive anywhere in the tree, on an <img> payload', () => {
    const manager = makeManager()
    const {doc} = applyFacetsToParsedDoc(
      manager,
      '<img src="https://example.com/x.png" onerror="alert(1)" alt="pic">',
      [],
    )
    const allAttrs = collectAllAttrs(doc)
    for (const attrs of allAttrs) {
      for (const key of Object.keys(attrs)) {
        expect(key.toLowerCase().startsWith('on')).toBe(false)
      }
    }
    // The image itself should still exist with its legitimate attributes -
    // sanitization removes the dangerous part, not the whole feature.
    const imageAttrs = allAttrs.find(a => a.src === 'https://example.com/x.png')
    expect(imageAttrs).toBeDefined()
    expect(imageAttrs?.alt).toBe('pic')
    expect(imageAttrs?.onerror).toBeUndefined()
  })

  it('never lets a javascript: URL survive as a src or href anywhere in the tree', () => {
    const manager = makeManager()
    const {doc} = applyFacetsToParsedDoc(
      manager,
      '<a href="javascript:alert(1)">click</a> and <img src="javascript:alert(1)">',
      [],
    )
    const allAttrs = collectAllAttrs(doc)
    for (const attrs of allAttrs) {
      if (typeof attrs.href === 'string') {
        expect(attrs.href.toLowerCase().startsWith('javascript:')).toBe(false)
      }
      if (typeof attrs.src === 'string') {
        expect(attrs.src.toLowerCase().startsWith('javascript:')).toBe(false)
      }
    }
  })

  it('drops svg onload and iframe javascript: src entirely, leaving surrounding text intact', () => {
    const manager = makeManager()
    const {doc} = applyFacetsToParsedDoc(
      manager,
      'before <svg onload="alert(1)"></svg> middle <iframe src="javascript:alert(1)"></iframe> after',
      [],
    )
    const text = flattenText(doc)
    expect(text).toContain('before')
    expect(text).toContain('middle')
    expect(text).toContain('after')
    expect(text).not.toContain('alert')
    const allAttrs = collectAllAttrs(doc)
    for (const attrs of allAttrs) {
      expect(
        Object.keys(attrs).some(k => k.toLowerCase().startsWith('on')),
      ).toBe(false)
    }
  })

  it('ordering requirement, tested directly: sanitizing after facet correlation does not corrupt a legitimate facet elsewhere in the same document', () => {
    // The actual invariant this design depends on - sanitize the doc, not
    // the string, strictly after correlation - proven by exercising both
    // in the same document, not just asserted separately.
    const manager = makeManager()
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {type: 'text', text: 'plain '},
            {type: 'text', text: 'underlined', marks: [{type: 'underline'}]},
          ],
        },
      ],
    }
    const saved = serializeToMarkdownAndFacets(manager, doc)
    expect(saved.droppedCount).toBe(0)

    // Splice a script tag into the middle of the real saved markdown, the
    // way a paste into the real editor could - the facet's own byte range
    // still points at the real, untouched "underlined" span.
    const withScript = saved.markdown + '\n\n<script>alert(1)</script>'

    const loaded = applyFacetsToParsedDoc(manager, withScript, saved.facets)
    expect(loaded.droppedCount).toBe(0)
    const text = flattenText(loaded.doc)
    expect(text).not.toContain('script')
    expect(text).not.toContain('alert')

    // The facet survived sanitization intact - re-serializing must
    // reproduce it exactly, the same property the round-trip tests check.
    const resaved = serializeToMarkdownAndFacets(manager, loaded.doc)
    expect(resaved.droppedCount).toBe(0)
    expect(resaved.facets).toEqual(saved.facets)
  })
})

/**
 * Every test above exercises sanitization only through the full HTML-parse
 * pipeline, where the real schema already rejects every payload tried
 * (confirmed directly, not assumed: temporarily disabling the
 * `sanitizeParsedDoc` call inside `applyFacetsToParsedDoc` and re-running
 * the suite above still passed all 6 tests unchanged). None of those tests
 * actually depend on `sanitizeParsedDoc`'s own allowlist logic - they pass
 * on ProseMirror's baseline behavior alone, exactly as `sanitize.ts`'s own
 * doc comment says should be expected. These tests call `sanitizeParsedDoc`
 * directly against hand-built docs carrying attribute keys the real schema
 * would never produce via HTML parsing, so they actually fail if the
 * allowlist logic itself is broken or removed, independent of upstream
 * library behavior.
 */
describe('sanitizeParsedDoc - unit-level, independent of whether the real schema would ever produce these inputs', () => {
  it('strips a disallowed non-event-handler key from an image node, keeping the allowed ones', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'image',
          attrs: {
            src: 'https://example.com/x.png',
            alt: 'pic',
            'data-evil': 'x',
          },
        },
      ],
    }
    sanitizeParsedDoc(doc)
    expect(collectAllAttrs(doc)).toEqual([
      {src: 'https://example.com/x.png', alt: 'pic'},
    ])
  })

  it('strips a disallowed key from a link mark, keeping the allowed ones', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'click',
              marks: [
                {
                  type: 'link',
                  attrs: {href: 'https://example.com', style: 'color:red'},
                },
              ],
            },
          ],
        },
      ],
    }
    sanitizeParsedDoc(doc)
    expect(collectAllAttrs(doc)).toEqual([{href: 'https://example.com'}])
  })

  it('strips a javascript: href from a hand-built link mark - never produced via real HTML parsing, so only the allowlist itself catches it', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'click',
              marks: [{type: 'link', attrs: {href: 'javascript:alert(1)'}}],
            },
          ],
        },
      ],
    }
    sanitizeParsedDoc(doc)
    expect(collectAllAttrs(doc)).toEqual([{}])
  })
})
