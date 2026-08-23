import {describe, expect, it} from '@jest/globals'

import {
  addFacet,
  deleteRange,
  detectParagraphStyle,
  type EditorFacet,
  type EditorState,
  facetsToWireFormat,
  getLineByteRange,
  insertLinePrefix,
  insertOrderedListPrefix,
  insertText,
  utf8Length,
  wrapSelection,
} from '../state'

function state(markdown: string, facets: EditorFacet[] = []): EditorState {
  return {markdown, facets}
}

describe('insertText', () => {
  it('inserts plain text with no facets', () => {
    const result = insertText(state('hello world'), 5, ' there')
    expect(result.markdown).toBe('hello there world')
  })

  it('shifts a facet entirely after the insertion point forward', () => {
    const facets: EditorFacet[] = [
      {
        byteStart: 6,
        byteEnd: 11,
        feature: {$type: 'com.sunnahsky.richtext.facets.formatting#underline'},
      },
    ]
    const result = insertText(state('hello world', facets), 0, 'XX')
    expect(result.markdown).toBe('XXhello world')
    expect(result.facets[0]).toMatchObject({byteStart: 8, byteEnd: 13})
  })

  it('leaves a facet entirely before the insertion point untouched', () => {
    const facets: EditorFacet[] = [
      {
        byteStart: 0,
        byteEnd: 5,
        feature: {$type: 'com.sunnahsky.richtext.facets.formatting#underline'},
      },
    ]
    const result = insertText(state('hello world', facets), 11, '!')
    expect(result.markdown).toBe('hello world!')
    expect(result.facets[0]).toMatchObject({byteStart: 0, byteEnd: 5})
  })

  it('grows a facet the insertion point falls inside', () => {
    const facets: EditorFacet[] = [
      {
        byteStart: 0,
        byteEnd: 11,
        feature: {$type: 'com.sunnahsky.richtext.facets.formatting#underline'},
      },
    ]
    const result = insertText(state('hello world', facets), 5, ',')
    expect(result.markdown).toBe('hello, world')
    expect(result.facets[0]).toMatchObject({byteStart: 0, byteEnd: 12})
  })

  it('shifts by real UTF-8 byte length, not UTF-16 character length (Arabic honorific case)', () => {
    // U+FDFA (ﷺ) is a single UTF-16 code unit but 3 bytes in UTF-8 - this is
    // the exact case @bsky/sdk's own RichText.insert() gets wrong via
    // insertText.length.
    const honorific = '\u{FDFA}'
    expect(utf8Length(honorific)).toBe(3)

    const facets: EditorFacet[] = [
      {
        byteStart: 10,
        byteEnd: 20,
        feature: {$type: 'com.sunnahsky.richtext.facets.formatting#underline'},
      },
    ]
    const result = insertText(state('before text', facets), 0, honorific)
    expect(result.facets[0]).toMatchObject({byteStart: 13, byteEnd: 23})
  })
})

describe('deleteRange', () => {
  it('drops a facet entirely inside the deleted range', () => {
    const facets: EditorFacet[] = [
      {
        byteStart: 2,
        byteEnd: 4,
        feature: {$type: 'com.sunnahsky.richtext.facets.formatting#underline'},
      },
    ]
    const result = deleteRange(state('hello world', facets), 0, 5)
    expect(result.markdown).toBe(' world')
    expect(result.facets).toHaveLength(0)
  })

  it('shifts a facet entirely after the deleted range back', () => {
    const facets: EditorFacet[] = [
      {
        byteStart: 6,
        byteEnd: 11,
        feature: {$type: 'com.sunnahsky.richtext.facets.formatting#underline'},
      },
    ]
    const result = deleteRange(state('hello world', facets), 0, 6)
    expect(result.markdown).toBe('world')
    expect(result.facets[0]).toMatchObject({byteStart: 0, byteEnd: 5})
  })

  it('leaves a facet entirely before the deleted range untouched', () => {
    const facets: EditorFacet[] = [
      {
        byteStart: 0,
        byteEnd: 5,
        feature: {$type: 'com.sunnahsky.richtext.facets.formatting#underline'},
      },
    ]
    const result = deleteRange(state('hello world', facets), 6, 11)
    expect(result.markdown).toBe('hello ')
    expect(result.facets[0]).toMatchObject({byteStart: 0, byteEnd: 5})
  })

  it('clips a facet that partially overlaps the start of the deleted range', () => {
    // facet covers bytes 3-8 ("lo wo"), delete bytes 5-11 ("wo world"... wait
    // delete 5-11 removes "world" tail) - facet's tail gets clipped.
    const facets: EditorFacet[] = [
      {
        byteStart: 3,
        byteEnd: 8,
        feature: {$type: 'com.sunnahsky.richtext.facets.formatting#underline'},
      },
    ]
    const result = deleteRange(state('hello world', facets), 5, 11)
    expect(result.markdown).toBe('hello')
    expect(result.facets[0]).toMatchObject({byteStart: 3, byteEnd: 5})
  })
})

describe('wrapSelection', () => {
  it('wraps a selection in bold markers and returns the shifted selection bounds', () => {
    const result = wrapSelection(state('hello world'), 6, 11, '**', '**')
    expect(result.state.markdown).toBe('hello **world**')
    expect(result.selStart).toBe(8)
    expect(result.selEnd).toBe(13)
  })

  it('shifts an unrelated existing facet correctly around both marker insertions', () => {
    const facets: EditorFacet[] = [
      {
        byteStart: 0,
        byteEnd: 5,
        feature: {$type: 'com.sunnahsky.richtext.facets.formatting#underline'},
      },
    ]
    const result = wrapSelection(
      state('hello world', facets),
      6,
      11,
      '**',
      '**',
    )
    // Facet is entirely before the selection, so it should be untouched.
    expect(result.state.facets[0]).toMatchObject({byteStart: 0, byteEnd: 5})
  })
})

describe('insertLinePrefix', () => {
  it('inserts at the start of the document', () => {
    const result = insertLinePrefix(state('Heading'), 0, '# ')
    expect(result.markdown).toBe('# Heading')
  })

  it('inserts at the start of a later line, not the byte index itself', () => {
    const result = insertLinePrefix(state('first line\nsecond line'), 15, '# ')
    expect(result.markdown).toBe('first line\n# second line')
  })
})

describe('insertOrderedListPrefix', () => {
  it('starts a new list at 1 when the preceding line is not a numbered item', () => {
    const result = insertOrderedListPrefix(state('first line\nsecond line'), 11)
    expect(result.markdown).toBe('first line\n1. second line')
  })

  it('continues the sequence when the preceding line is a numbered item', () => {
    const result = insertOrderedListPrefix(
      state('1. first item\nsecond line'),
      14,
    )
    expect(result.markdown).toBe('1. first item\n2. second line')
  })

  it('continues from a double-digit number correctly', () => {
    const result = insertOrderedListPrefix(
      state('9. ninth item\nsecond line'),
      14,
    )
    expect(result.markdown).toBe('9. ninth item\n10. second line')
  })

  it('starts at 1 for the very first line of the document', () => {
    const result = insertOrderedListPrefix(state('only line'), 0)
    expect(result.markdown).toBe('1. only line')
  })
})

describe('detectParagraphStyle', () => {
  it('detects a plain line as paragraph', () => {
    expect(detectParagraphStyle('Just some text.', [], 5)).toBe('paragraph')
  })

  it('detects title/subheading1/subheading2 from # prefixes', () => {
    expect(detectParagraphStyle('# A title', [], 3)).toBe('title')
    expect(detectParagraphStyle('## A subheading', [], 3)).toBe('subheading1')
    expect(detectParagraphStyle('### A subheading', [], 3)).toBe('subheading2')
  })

  it('detects bulleted and numbered lists', () => {
    expect(detectParagraphStyle('- an item', [], 3)).toBe('bulletedList')
    expect(detectParagraphStyle('12. an item', [], 3)).toBe('numberedList')
  })

  it('detects a plain block quote', () => {
    expect(detectParagraphStyle('> a quote', [], 3)).toBe('blockQuote')
  })

  it('detects Arabic Block Quote from a > prefix plus an arabicQuote facet covering the line', () => {
    const markdown = '> Arabic paragraph text.'
    const facets: EditorFacet[] = [
      {
        byteStart: 0,
        byteEnd: utf8Length(markdown),
        feature: {
          $type: 'com.sunnahsky.richtext.facets.blocks#typography',
          value: 'arabicQuote',
        },
      },
    ]
    expect(detectParagraphStyle(markdown, facets, 3)).toBe('arabicBlockQuote')
  })

  it('detects Arabic Paragraph from an arabicParagraph facet with no > prefix', () => {
    const markdown = 'Arabic paragraph text.'
    const facets: EditorFacet[] = [
      {
        byteStart: 0,
        byteEnd: utf8Length(markdown),
        feature: {
          $type: 'com.sunnahsky.richtext.facets.blocks#typography',
          value: 'arabicParagraph',
        },
      },
    ]
    expect(detectParagraphStyle(markdown, facets, 3)).toBe('arabicParagraph')
  })
})

describe('getLineByteRange', () => {
  it('returns the whole string for a single-line document', () => {
    expect(getLineByteRange('hello world', 5)).toEqual({
      byteStart: 0,
      byteEnd: 11,
    })
  })

  it('returns just the containing line in a multi-line document', () => {
    const markdown = 'first line\nsecond line\nthird line'
    // byte index 15 is inside "second line"
    expect(getLineByteRange(markdown, 15)).toEqual({
      byteStart: 11,
      byteEnd: 22,
    })
  })

  it('handles the cursor sitting exactly at a line boundary', () => {
    const markdown = 'first line\nsecond line'
    expect(getLineByteRange(markdown, 11)).toEqual({
      byteStart: 11,
      byteEnd: 22,
    })
  })
})

describe('addFacet', () => {
  it('appends a facet without touching the markdown', () => {
    const result = addFacet(state('hello world'), 6, 11, {
      $type: 'com.sunnahsky.richtext.facets.formatting#underline',
    })
    expect(result.markdown).toBe('hello world')
    expect(result.facets).toEqual([
      {
        byteStart: 6,
        byteEnd: 11,
        feature: {$type: 'com.sunnahsky.richtext.facets.formatting#underline'},
      },
    ])
  })
})

describe('facetsToWireFormat', () => {
  it('maps formatting features to the formatting lexicon, block features to blocks', () => {
    const facets: EditorFacet[] = [
      {
        byteStart: 0,
        byteEnd: 5,
        feature: {$type: 'com.sunnahsky.richtext.facets.formatting#underline'},
      },
      {
        byteStart: 6,
        byteEnd: 11,
        feature: {
          $type: 'com.sunnahsky.richtext.facets.blocks#textAlign',
          value: 'center',
        },
      },
    ]
    const wire = facetsToWireFormat(facets)
    expect(wire).toEqual([
      {
        $type: 'com.sunnahsky.richtext.facets.formatting',
        index: {byteStart: 0, byteEnd: 5},
        features: [
          {$type: 'com.sunnahsky.richtext.facets.formatting#underline'},
        ],
      },
      {
        $type: 'com.sunnahsky.richtext.facets.blocks',
        index: {byteStart: 6, byteEnd: 11},
        features: [
          {
            $type: 'com.sunnahsky.richtext.facets.blocks#textAlign',
            value: 'center',
          },
        ],
      },
    ])
  })

  it('maps the typography feature to the blocks lexicon too', () => {
    const facets: EditorFacet[] = [
      {
        byteStart: 0,
        byteEnd: 5,
        feature: {
          $type: 'com.sunnahsky.richtext.facets.blocks#typography',
          value: 'arabicQuote',
        },
      },
    ]
    expect(facetsToWireFormat(facets)).toEqual([
      {
        $type: 'com.sunnahsky.richtext.facets.blocks',
        index: {byteStart: 0, byteEnd: 5},
        features: [
          {
            $type: 'com.sunnahsky.richtext.facets.blocks#typography',
            value: 'arabicQuote',
          },
        ],
      },
    ])
  })
})

describe('Arabic Block Quote composition (blockquote prefix + typography facet)', () => {
  // Security-review-mandated ordering: insert the `>` blockquote prefix
  // FIRST, then compute the typography facet's byte range against the
  // now-shifted line - never the reverse, and never computed independently.
  // This test pins that exact ordering by construction: it calls
  // `insertLinePrefix` before `getLineByteRange`/`addFacet`, mirroring
  // `onSetTypography`'s real call order in index.tsx for the "Arabic Block
  // Quote" paragraph-style option.
  it('facet byte range lands on the paragraph text after the prefix shifts it, not before', () => {
    const initial = state('Arabic paragraph text.')
    const withPrefix = insertLinePrefix(initial, 0, '> ')
    expect(withPrefix.markdown).toBe('> Arabic paragraph text.')

    // Now compute the typography facet against the prefixed line - the
    // facet must span the whole line INCLUDING the "> " prefix (byteStart 0),
    // not just the original pre-prefix text (which would incorrectly start
    // at byte 2 if computed against the old, unprefixed string).
    const line = getLineByteRange(withPrefix.markdown, 0)
    expect(line).toEqual({byteStart: 0, byteEnd: 24})

    const result = addFacet(withPrefix, line.byteStart, line.byteEnd, {
      $type: 'com.sunnahsky.richtext.facets.blocks#typography',
      value: 'arabicQuote',
    })
    expect(result.facets).toEqual([
      {
        byteStart: 0,
        byteEnd: 24,
        feature: {
          $type: 'com.sunnahsky.richtext.facets.blocks#typography',
          value: 'arabicQuote',
        },
      },
    ])
  })
})
