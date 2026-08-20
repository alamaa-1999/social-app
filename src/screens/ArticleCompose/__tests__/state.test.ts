import {describe, expect, it} from '@jest/globals'

import {
  addFacet,
  deleteRange,
  type EditorFacet,
  type EditorState,
  facetsToWireFormat,
  getLineByteRange,
  insertLinePrefix,
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
})
