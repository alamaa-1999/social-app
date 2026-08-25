import BulletList from '@tiptap/extension-bullet-list'
import Blockquote from '@tiptap/extension-blockquote'
import Bold from '@tiptap/extension-bold'
import {Color} from '@tiptap/extension-color'
import Heading from '@tiptap/extension-heading'
import Italic from '@tiptap/extension-italic'
import Link from '@tiptap/extension-link'
import ListItem from '@tiptap/extension-list-item'
import Strike from '@tiptap/extension-strike'
import {TextStyle} from '@tiptap/extension-text-style'
import Underline from '@tiptap/extension-underline'
/**
 * `tiptap-markdown-fixed`, not the bare `@tiptap/markdown` - see
 * `../index.ts`'s identical import for the full explanation: the bare
 * package name's own peer resolves to this app's pre-existing v2
 * `@tiptap/core` (a real, live bug confirmed in the actual Vite bundle
 * too, not a test-only artifact), and only a pnpm alias
 * (`pnpm-workspace.yaml`) forces a genuinely separate, correctly-resolved
 * v3 copy.
 */
import {MarkdownManager} from 'tiptap-markdown-fixed'

/**
 * Document/Paragraph/Text specifically, not bare-imported like the marks
 * above. This app has a pre-existing, legitimate direct dependency on
 * `@tiptap/extension-document`/`paragraph`/`text` at v2.9.1 for the
 * unrelated web post-composer, which wins bare top-level resolution -
 * unlike Bold/Italic/etc above, which aren't direct dependencies of
 * anything else and so resolve to `@10play/tentap-editor`'s real v3
 * request without needing this. `@10play/tentap-editor`'s own `CoreBridge`
 * resolves these two bare from *inside* its own directory (plain upward
 * directory-walk resolution, no exports check involved), which is why its
 * production code needs no special import - but reaching into that same
 * nested copy from *outside* the package (as this test does) is blocked by
 * `@10play/tentap-editor`'s own `package.json` `exports` map, which has no
 * `./node_modules/*` subpath exposed (confirmed directly:
 * `ERR_PACKAGE_PATH_NOT_EXPORTED`). Aliased pnpm dependencies
 * (`pnpm-workspace.yaml`) sidestep this entirely - same mechanism as
 * `tiptap-markdown-fixed` above, applied to all three. This mismatch (v2
 * Paragraph/Text/Document silently reaching `@tiptap/markdown`'s
 * registration path) is a real bug this test surfaced in production too,
 * not a test-only artifact - see `Sunnahsky_Week3_Engineering_Notes.md`.
 */
import Document from 'tiptap-extension-document-fixed'
import Paragraph from 'tiptap-extension-paragraph-fixed'
import Text from 'tiptap-extension-text-fixed'

import {bidiIsolateMark} from '../../../bidiIsolate'
import {anchoredIndexOf} from '../anchoredSearch'
import {applyFacetsToParsedDoc, serializeToMarkdownAndFacets} from '../index'
import {validateFacetBounds} from '../../../state'

/**
 * `@tiptap/extension-underline`'s own default `renderMarkdown` emits
 * `++text++` (a real, but non-standard, Pandoc-style markdown extension,
 * not CommonMark/GFM) - discovered via this exact test failing with
 * `"plain ++underlined++"` instead of the expected plain text. This
 * project's lexicon deliberately keeps underline as a facet-only concept,
 * not raw markdown syntax (`HANDOFF.md`: "underline stays a custom
 * facet") specifically so any CommonMark-only renderer with zero
 * knowledge of this facet still renders sensible plain text - `++...++`
 * syntax leaking into the body would defeat that. Suppressing the mark's
 * own wrapping syntax here (returning the placeholder unwrapped) is a
 * real requirement the actual `UnderlineBridge` wiring will also need,
 * not just this test's own fixture - flagged for that follow-up work.
 */
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
      bidiIsolateMark,
      TextStyle,
      Color,
      Heading,
      Link,
      BulletList,
      ListItem,
    ] as never,
  })
}

describe('anchoredIndexOf', () => {
  it('finds a plain match with no anchor pressure', () => {
    expect(anchoredIndexOf('hello world', 'world', 0, 0)).toBe(6)
  })

  it('never matches before the cursor', () => {
    const haystack = 'cat cat cat'
    expect(anchoredIndexOf(haystack, 'cat', 4, 0)).toBe(4)
    expect(anchoredIndexOf(haystack, 'cat', 8, 0)).toBe(8)
  })

  it('never matches before the approx estimate, even with cursor at 0', () => {
    const haystack = 'cat cat cat'
    expect(anchoredIndexOf(haystack, 'cat', 0, 5)).toBe(8)
  })

  it('returns -1 for an empty needle', () => {
    expect(anchoredIndexOf('anything', '', 0, 0)).toBe(-1)
  })

  it('returns -1 when the needle occurs nowhere at or after the anchor', () => {
    expect(anchoredIndexOf('cat cat', 'cat', 5, 0)).toBe(-1)
  })
})

describe('serializeToMarkdownAndFacets', () => {
  it('emits no facets for plain bold/italic text - native syntax, no custom facet needed', () => {
    const manager = makeManager()
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {type: 'text', text: 'Hello '},
            {type: 'text', text: 'world', marks: [{type: 'bold'}]},
          ],
        },
      ],
    }
    const result = serializeToMarkdownAndFacets(manager, doc)
    expect(result.markdown.trim()).toBe('Hello **world**')
    expect(result.facets).toEqual([])
    expect(result.droppedCount).toBe(0)
  })

  it('emits an underline facet with correct byte offsets', () => {
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
    const result = serializeToMarkdownAndFacets(manager, doc)
    expect(result.markdown.trim()).toBe('plain underlined')
    expect(result.facets).toEqual([
      {
        byteStart: 6,
        byteEnd: 16,
        feature: {$type: 'com.sunnahsky.richtext.facets.formatting#underline'},
      },
    ])
  })

  it('emits a color facet only for an allowlisted hex value, dropping a disallowed one silently', () => {
    const manager = makeManager()
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'red',
              marks: [{type: 'textStyle', attrs: {color: '#ff0000'}}],
            },
            {type: 'text', text: ' '},
            {
              type: 'text',
              text: 'evil',
              marks: [
                {type: 'textStyle', attrs: {color: 'javascript:alert(1)'}},
              ],
            },
          ],
        },
      ],
    }
    const result = serializeToMarkdownAndFacets(manager, doc)
    expect(result.facets).toEqual([
      {
        byteStart: 0,
        byteEnd: 3,
        feature: {
          $type: 'com.sunnahsky.richtext.facets.formatting#color',
          value: '#ff0000',
        },
      },
    ])
  })

  it('emits a typography facet spanning the whole paragraph', () => {
    const manager = makeManager()
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: {typography: 'arabicParagraph'},
          content: [{type: 'text', text: 'بسم الله'}],
        },
      ],
    }
    const result = serializeToMarkdownAndFacets(manager, doc)
    expect(result.facets).toHaveLength(1)
    expect(result.facets[0].feature).toEqual({
      $type: 'com.sunnahsky.richtext.facets.blocks#typography',
      value: 'arabicParagraph',
    })
  })

  it('does not emit a textAlign facet for the default alignment value', () => {
    const manager = makeManager()
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: {textAlign: 'left'},
          content: [{type: 'text', text: 'default aligned'}],
        },
      ],
    }
    const result = serializeToMarkdownAndFacets(manager, doc)
    expect(result.facets).toEqual([])
  })

  it('emits both typography and textAlign as separate facets sharing one located range, from one search', () => {
    const manager = makeManager()
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: {typography: 'arabicQuote', textAlign: 'right'},
          content: [{type: 'text', text: 'shared range'}],
        },
      ],
    }
    const result = serializeToMarkdownAndFacets(manager, doc)
    expect(result.facets).toHaveLength(2)
    expect(result.facets[0].byteStart).toBe(result.facets[1].byteStart)
    expect(result.facets[0].byteEnd).toBe(result.facets[1].byteEnd)
  })

  it('handles duplicate adjacent marked runs correctly via the anchored monotonic search - stress case from the review series', () => {
    const manager = makeManager()
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{type: 'text', text: 'same', marks: [{type: 'underline'}]}],
        },
        {
          type: 'paragraph',
          content: [{type: 'text', text: 'same', marks: [{type: 'underline'}]}],
        },
        {
          type: 'paragraph',
          content: [{type: 'text', text: 'same', marks: [{type: 'underline'}]}],
        },
      ],
    }
    const result = serializeToMarkdownAndFacets(manager, doc)
    expect(result.droppedCount).toBe(0)
    expect(result.facets).toHaveLength(3)
    const starts = result.facets.map(f => f.byteStart)
    // Each occurrence must land on its own distinct position, strictly
    // increasing - not all three collapsing onto the first "same".
    expect(new Set(starts).size).toBe(3)
    expect(starts[0]).toBeLessThan(starts[1])
    expect(starts[1]).toBeLessThan(starts[2])
    for (const facet of result.facets) {
      expect(result.markdown.slice(facet.byteStart, facet.byteEnd)).toBe('same')
    }
  })

  it('correctly escapes markdown-special characters in a facet-carrying run without corrupting the offset', () => {
    const manager = makeManager()
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {type: 'text', text: 'price is '},
            {type: 'text', text: '5 * 3', marks: [{type: 'underline'}]},
          ],
        },
      ],
    }
    const result = serializeToMarkdownAndFacets(manager, doc)
    expect(result.droppedCount).toBe(0)
    expect(result.facets).toHaveLength(1)
    const facet = result.facets[0]
    const encoder = new TextEncoder()
    const decoder = new TextDecoder()
    const slice = decoder.decode(
      encoder.encode(result.markdown).slice(facet.byteStart, facet.byteEnd),
    )
    // Escaping genuinely happened - asserted directly, not via a
    // replace-then-compare that would pass whether or not it did (a real
    // gap a reviewer caught: the original version of this assertion,
    // `slice.replace(/\\/g, '') === '5 * 3'`, is true either way and
    // proves nothing about escaping actually occurring).
    expect(slice).toBe('5 \\* 3')
    // Whatever the real escaped form is, the located range must decode
    // back to it exactly - the point of using the real escaped substring
    // as the search target rather than the raw, unescaped text.
    expect(slice.replace(/\\/g, '')).toBe('5 * 3')
  })
})

describe('validateFacetBounds', () => {
  it('accepts in-range facets and rejects out-of-range ones', () => {
    const markdown = 'hello world'
    const byteLength = new TextEncoder().encode(markdown).byteLength
    const facets = [
      {
        byteStart: 0,
        byteEnd: 5,
        feature: {
          $type: 'com.sunnahsky.richtext.facets.formatting#underline',
        } as const,
      },
      {
        byteStart: 5,
        byteEnd: byteLength + 10,
        feature: {
          $type: 'com.sunnahsky.richtext.facets.formatting#underline',
        } as const,
      },
      {
        byteStart: -1,
        byteEnd: 3,
        feature: {
          $type: 'com.sunnahsky.richtext.facets.formatting#underline',
        } as const,
      },
      {
        byteStart: 5,
        byteEnd: 2,
        feature: {
          $type: 'com.sunnahsky.richtext.facets.formatting#underline',
        } as const,
      },
    ]
    const result = validateFacetBounds(markdown, facets)
    expect(result.valid).toEqual([facets[0]])
    expect(result.invalidCount).toBe(3)
  })
})

describe('fail-closed: a facet whose substring cannot be confidently located is dropped, never guessed', () => {
  it('drops a facet when the injected search cannot find its substring, rather than falling back to a wrong position', () => {
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
    // A search that always fails, standing in for the case this design's
    // security review required a hard answer for: no confident match
    // found. The real `anchoredIndexOf` should essentially never hit this
    // in practice (the substring comes from the manager's own real
    // output) - this test exercises the caller-facing contract directly,
    // not trying to naturally provoke a rare edge case.
    const alwaysFailSearch = () => -1
    const result = serializeToMarkdownAndFacets(manager, doc, alwaysFailSearch)
    expect(result.facets).toEqual([])
    expect(result.droppedCount).toBe(1)
    // Critically: the markdown body itself is untouched - dropping a facet
    // never mutates or corrupts the underlying content, only the facet
    // metadata describing it is lost.
    expect(result.markdown.trim()).toBe('plain underlined')
  })

  it('drops only the facets on the specific span that could not be located, not the whole document', () => {
    const manager = makeManager()
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {type: 'text', text: 'first', marks: [{type: 'underline'}]},
            {type: 'text', text: ' and '},
            {type: 'text', text: 'second', marks: [{type: 'underline'}]},
          ],
        },
      ],
    }
    let calls = 0
    // Fail only the first candidate span located, succeed on the rest -
    // confirms partial failure doesn't cascade into dropping everything.
    const failFirstOnly: typeof anchoredIndexOf = (
      haystack,
      needle,
      cursor,
      approx,
    ) => {
      calls++
      if (calls === 1) return -1
      return anchoredIndexOf(haystack, needle, cursor, approx)
    }
    const result = serializeToMarkdownAndFacets(manager, doc, failFirstOnly)
    expect(result.droppedCount).toBe(1)
    expect(result.facets).toHaveLength(1)
    expect(
      result.markdown.slice(
        result.facets[0].byteStart,
        result.facets[0].byteEnd,
      ),
    ).toBe('second')
  })
})

describe('encodeTextForMarkdown in real rendering context, not isolation', () => {
  it('produces a byte-identical facet range for underlined text inside a link', () => {
    const manager = makeManager()
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'click here',
              marks: [
                {type: 'link', attrs: {href: 'https://example.com'}},
                {type: 'underline'},
              ],
            },
          ],
        },
      ],
    }
    const result = serializeToMarkdownAndFacets(manager, doc)
    expect(result.droppedCount).toBe(0)
    expect(result.facets).toHaveLength(1)
    const facet = result.facets[0]
    const slice = result.markdown.slice(facet.byteStart, facet.byteEnd)
    expect(slice).toBe('click here')
    // The located range must sit *inside* the link syntax, not overlap or
    // include it - `[click here](https://example.com)`.
    expect(result.markdown).toContain('[click here](https://example.com)')
  })

  it('produces a byte-identical facet range for underlined text inside a heading', () => {
    const manager = makeManager()
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: {level: 2},
          content: [
            {type: 'text', text: 'a '},
            {type: 'text', text: 'heading', marks: [{type: 'underline'}]},
          ],
        },
      ],
    }
    const result = serializeToMarkdownAndFacets(manager, doc)
    expect(result.droppedCount).toBe(0)
    expect(result.facets).toHaveLength(1)
    const facet = result.facets[0]
    expect(result.markdown.slice(facet.byteStart, facet.byteEnd)).toBe(
      'heading',
    )
    expect(result.markdown.trim()).toBe('## a heading')
  })

  it('produces a byte-identical facet range for underlined text inside a list item', () => {
    const manager = makeManager()
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [
                    {type: 'text', text: 'an '},
                    {type: 'text', text: 'item', marks: [{type: 'underline'}]},
                  ],
                },
              ],
            },
          ],
        },
      ],
    }
    const result = serializeToMarkdownAndFacets(manager, doc)
    expect(result.droppedCount).toBe(0)
    expect(result.facets).toHaveLength(1)
    const facet = result.facets[0]
    expect(result.markdown.slice(facet.byteStart, facet.byteEnd)).toBe('item')
    expect(result.markdown).toContain('- an item')
  })
})

describe('block facets nested inside a blockquote/list item, not just at the top level', () => {
  it('correctly locates a typography facet on a paragraph nested inside a blockquote, glue prefix included in the search but not the located range', () => {
    const manager = makeManager()
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'blockquote',
          content: [
            {
              type: 'paragraph',
              attrs: {typography: 'arabicQuote'},
              content: [{type: 'text', text: 'nested arabic quote text'}],
            },
          ],
        },
      ],
    }
    const result = serializeToMarkdownAndFacets(manager, doc)
    expect(result.droppedCount).toBe(0)
    expect(result.facets).toHaveLength(1)
    const facet = result.facets[0]
    // `renderNodeToMarkdown` on the nested paragraph returns its own
    // content only, unaware of the blockquote `>` prefix its parent adds
    // afterward - so the located range is the bare text, and the real
    // question this test answers is whether the located range still ends
    // up correct (not offset by the `>` prefix) once that prefix has
    // actually been added to the final assembled string by the time the
    // anchored search runs against it.
    expect(result.markdown.slice(facet.byteStart, facet.byteEnd)).toBe(
      'nested arabic quote text',
    )
    expect(result.markdown).toContain('> nested arabic quote text')
  })

  it('correctly locates a typography facet on a paragraph nested inside a list item', () => {
    const manager = makeManager()
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  attrs: {typography: 'arabicParagraph'},
                  content: [{type: 'text', text: 'nested list paragraph'}],
                },
              ],
            },
          ],
        },
      ],
    }
    const result = serializeToMarkdownAndFacets(manager, doc)
    expect(result.droppedCount).toBe(0)
    expect(result.facets).toHaveLength(1)
    const facet = result.facets[0]
    expect(result.markdown.slice(facet.byteStart, facet.byteEnd)).toBe(
      'nested list paragraph',
    )
    expect(result.markdown).toContain('- nested list paragraph')
  })
})

describe('save -> load round trip', () => {
  it('round-trips a faceted run containing every markdown-special character that gets escaped', () => {
    // The exact regression a colleague's review caught by running the real
    // serializer rather than reading it: `applyFacetsToParsedDoc` used to
    // slice a facet's byte range from the raw, still-escaped markdown
    // string, then search for that raw slice inside the parsed,
    // already-unescaped doc text - a search that can never match for any
    // faceted text containing one of `\ * _ ~ \` [ ]`. Neither existing
    // round-trip test used a special character in a faceted run, so this
    // path had zero coverage before this test - not just weak coverage.
    const manager = makeManager()
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {type: 'text', text: 'plain '},
            {
              type: 'text',
              // One of each character `escapeMarkdownSyntax` escapes:
              // backslash, backtick, asterisk, underscore, open/close
              // bracket, tilde.
              text: '\\ ` * _ [ ] ~ done',
              marks: [{type: 'underline'}],
            },
          ],
        },
      ],
    }
    const saved = serializeToMarkdownAndFacets(manager, doc)
    expect(saved.droppedCount).toBe(0)
    expect(saved.facets).toHaveLength(1)

    const loaded = applyFacetsToParsedDoc(manager, saved.markdown, saved.facets)
    // The actual regression: this used to always be 1 (silently dropped),
    // for every one of these characters, every time.
    expect(loaded.droppedCount).toBe(0)

    const resaved = serializeToMarkdownAndFacets(manager, loaded.doc)
    expect(resaved.droppedCount).toBe(0)
    expect(resaved.facets).toEqual(saved.facets)
    // The reloaded doc's actual text content must be byte-for-byte the
    // original, unescaped string - not the raw escaped form leaking
    // through, and not any character silently lost.
    const reloadedText = (
      loaded.doc as {content: Array<{content: Array<{text?: string}>}>}
    ).content[0].content
      .map(n => n.text ?? '')
      .join('')
    expect(reloadedText).toBe('plain \\ ` * _ [ ] ~ done')
  })

  it('round-trips underline, color, typography, and textAlign together', () => {
    const manager = makeManager()
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: {typography: 'arabicParagraph', textAlign: 'right'},
          content: [{type: 'text', text: 'aligned arabic paragraph'}],
        },
        {
          type: 'paragraph',
          content: [
            {type: 'text', text: 'plain '},
            {type: 'text', text: 'underlined', marks: [{type: 'underline'}]},
            {type: 'text', text: ' and '},
            {
              type: 'text',
              text: 'colored',
              marks: [{type: 'textStyle', attrs: {color: '#00ff00'}}],
            },
          ],
        },
      ],
    }

    const saved = serializeToMarkdownAndFacets(manager, doc)
    expect(saved.droppedCount).toBe(0)
    expect(saved.facets).toHaveLength(4)

    const loaded = applyFacetsToParsedDoc(manager, saved.markdown, saved.facets)
    expect(loaded.droppedCount).toBe(0)

    // Re-serializing the reloaded doc must reproduce the same facets -
    // the actual property under test, not just "some doc came back."
    const resaved = serializeToMarkdownAndFacets(manager, loaded.doc)
    expect(resaved.droppedCount).toBe(0)
    expect(
      [...resaved.facets].sort((a, b) => a.byteStart - b.byteStart),
    ).toEqual([...saved.facets].sort((a, b) => a.byteStart - b.byteStart))
  })

  it('round-trips duplicate adjacent underlined runs to their own distinct occurrences, not all collapsing onto the first', () => {
    const manager = makeManager()
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{type: 'text', text: 'dup', marks: [{type: 'underline'}]}],
        },
        {
          type: 'paragraph',
          content: [{type: 'text', text: 'dup', marks: [{type: 'underline'}]}],
        },
      ],
    }
    const saved = serializeToMarkdownAndFacets(manager, doc)
    expect(saved.droppedCount).toBe(0)
    const loaded = applyFacetsToParsedDoc(manager, saved.markdown, saved.facets)
    expect(loaded.droppedCount).toBe(0)
    const resaved = serializeToMarkdownAndFacets(manager, loaded.doc)
    expect(resaved.facets).toHaveLength(2)
    expect(resaved.facets[0].byteStart).not.toBe(resaved.facets[1].byteStart)
  })
})

/**
 * `applyHonorificIsolation` isn't exported - it's an internal normalization
 * pass, exercised the way it actually runs: through `applyFacetsToParsedDoc`,
 * the single load-path function every caller uses.
 */
describe('honorific bidi isolation (load path)', () => {
  const SALLALLAHOU = String.fromCodePoint(0xfdfa)
  const RADI_ANH = String.fromCodePoint(0xfd41)

  function textNodesOf(node: JSONNodeLike): JSONNodeLike[] {
    if (node.type === 'text') return [node]
    return (node.content ?? []).flatMap(textNodesOf)
  }

  type JSONNodeLike = {
    type?: string
    text?: string
    marks?: {type: string}[]
    content?: JSONNodeLike[]
  }

  it('isolates a honorific glyph and leaves the surrounding text unmarked', () => {
    const manager = makeManager()
    const {doc} = applyFacetsToParsedDoc(
      manager,
      `The Prophet ${SALLALLAHOU} said`,
      [],
    )
    const runs = textNodesOf(doc as JSONNodeLike)
    const isolated = runs.filter(r =>
      r.marks?.some(m => m.type === 'bidiIsolate'),
    )
    expect(isolated).toHaveLength(1)
    expect(isolated[0].text).toBe(SALLALLAHOU)
    // Surrounding text survives intact and carries no isolation mark.
    expect(runs.map(r => r.text).join('')).toBe(
      `The Prophet ${SALLALLAHOU} said`,
    )
    for (const run of runs) {
      if (run.text === SALLALLAHOU) continue
      expect(run.marks?.some(m => m.type === 'bidiIsolate') ?? false).toBe(
        false,
      )
    }
  })

  it('isolates each of several honorifics separately, not as one run', () => {
    const manager = makeManager()
    const {doc} = applyFacetsToParsedDoc(
      manager,
      `A ${SALLALLAHOU} b ${RADI_ANH} c`,
      [],
    )
    const isolated = textNodesOf(doc as JSONNodeLike).filter(r =>
      r.marks?.some(m => m.type === 'bidiIsolate'),
    )
    expect(isolated.map(r => r.text)).toEqual([SALLALLAHOU, RADI_ANH])
  })

  it('leaves text with no honorific completely untouched', () => {
    const manager = makeManager()
    const {doc} = applyFacetsToParsedDoc(manager, 'ordinary text only', [])
    const runs = textNodesOf(doc as JSONNodeLike)
    expect(runs.map(r => r.text).join('')).toBe('ordinary text only')
    expect(runs.some(r => r.marks?.some(m => m.type === 'bidiIsolate'))).toBe(
      false,
    )
  })

  it('does not double-isolate across a save/load round trip', () => {
    const manager = makeManager()
    const first = applyFacetsToParsedDoc(
      manager,
      `Peace ${SALLALLAHOU} be upon him`,
      [],
    )
    const saved = serializeToMarkdownAndFacets(manager, first.doc)
    const second = applyFacetsToParsedDoc(manager, saved.markdown, saved.facets)
    const isolated = textNodesOf(second.doc as JSONNodeLike).filter(r =>
      r.marks?.some(m => m.type === 'bidiIsolate'),
    )
    expect(isolated).toHaveLength(1)
    // Exactly one isolate mark on it, never a nested/duplicated pair.
    expect(
      isolated[0].marks?.filter(m => m.type === 'bidiIsolate'),
    ).toHaveLength(1)
    // And the round trip preserves the text itself byte-for-byte.
    expect(
      textNodesOf(second.doc as JSONNodeLike)
        .map(r => r.text)
        .join(''),
    ).toBe(`Peace ${SALLALLAHOU} be upon him`)
  })

  it('preserves an existing mark on the run it splits', () => {
    const manager = makeManager()
    const {doc} = applyFacetsToParsedDoc(
      manager,
      `**bold ${SALLALLAHOU} bold**`,
      [],
    )
    const runs = textNodesOf(doc as JSONNodeLike)
    const isolated = runs.find(r =>
      r.marks?.some(m => m.type === 'bidiIsolate'),
    )
    expect(isolated).toBeDefined()
    // The glyph keeps bold as well as gaining the isolate.
    expect(isolated!.marks?.some(m => m.type === 'bold')).toBe(true)
  })
})

/**
 * Regression: an empty editor silently discarded the first paragraph style
 * the author picked. `manager.parse('')` yields a doc with no block node at
 * all, so the toolbar's `clearNodes().updateAttributes('paragraph', ...)`
 * chain matched nothing and no-opped; ProseMirror then built a fresh
 * paragraph with default attrs on the first keypress. Reported from a real
 * click-through as "selecting a style at the start of typing doesn't apply -
 * I have to type something first."
 */
describe('empty document always has a block to style', () => {
  it('gives an empty markdown source a real paragraph node', () => {
    const manager = makeManager()
    const {doc} = applyFacetsToParsedDoc(manager, '', [])
    expect(doc.content).toBeDefined()
    expect(doc.content).toHaveLength(1)
    expect(doc.content![0].type).toBe('paragraph')
  })

  it('leaves a document that already has content untouched', () => {
    const manager = makeManager()
    const {doc} = applyFacetsToParsedDoc(manager, 'hello', [])
    expect(doc.content).toHaveLength(1)
    expect(doc.content![0].type).toBe('paragraph')
    expect(doc.content![0].content?.[0].text).toBe('hello')
  })

  it('round-trips an empty document back to empty markdown, not a stray blank', () => {
    const manager = makeManager()
    const {doc} = applyFacetsToParsedDoc(manager, '', [])
    const {markdown, facets, droppedCount} = serializeToMarkdownAndFacets(
      manager,
      doc,
    )
    expect(markdown.trim()).toBe('')
    expect(facets).toHaveLength(0)
    expect(droppedCount).toBe(0)
  })
})
