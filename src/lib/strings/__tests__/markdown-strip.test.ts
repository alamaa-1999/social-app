import {describe, expect, it} from '@jest/globals'

import {deriveTextContentFromMarkdown} from '../markdown-strip'

describe('deriveTextContentFromMarkdown', () => {
  it('strips headings', () => {
    expect(deriveTextContentFromMarkdown('# Heading one\n## Heading two')).toBe(
      'Heading one\nHeading two',
    )
  })

  it('strips bold', () => {
    expect(deriveTextContentFromMarkdown('This is **bold** text.')).toBe(
      'This is bold text.',
    )
  })

  it('strips italic (asterisk and underscore forms)', () => {
    expect(deriveTextContentFromMarkdown('This is *italic* text.')).toBe(
      'This is italic text.',
    )
    expect(deriveTextContentFromMarkdown('This is _italic_ text.')).toBe(
      'This is italic text.',
    )
  })

  it('strips strikethrough', () => {
    expect(deriveTextContentFromMarkdown('This is ~~struck~~ text.')).toBe(
      'This is struck text.',
    )
  })

  it('strips unordered and ordered list markers', () => {
    expect(deriveTextContentFromMarkdown('- First\n- Second')).toBe(
      'First\nSecond',
    )
    expect(deriveTextContentFromMarkdown('1. First\n2. Second')).toBe(
      'First\nSecond',
    )
  })

  it('strips blockquote markers', () => {
    expect(deriveTextContentFromMarkdown('> A quoted line')).toBe(
      'A quoted line',
    )
  })

  it('strips links, keeping the link text', () => {
    expect(
      deriveTextContentFromMarkdown('See [the article](https://sunnahsky.com)'),
    ).toBe('See the article')
  })

  it('strips inline code and code fences, keeping the code content', () => {
    expect(deriveTextContentFromMarkdown('Run `pnpm test` first.')).toBe(
      'Run pnpm test first.',
    )
    expect(deriveTextContentFromMarkdown('```js\nconst x = 1\n```')).toBe(
      'const x = 1',
    )
  })

  it('does not let a list-marker asterisk pair with an unrelated later asterisk', () => {
    // Regression: a naive '*(.+)*' emphasis regex with content spanning
    // newlines would treat the leading '* ' list markers below as an
    // opening/closing italic pair around both list items, mangling them
    // instead of stripping two independent bullets.
    expect(deriveTextContentFromMarkdown('* First item\n* Second item')).toBe(
      'First item\nSecond item',
    )
  })

  it('leaves Arabic honorific ligatures and the U+200F RTL mark untouched', () => {
    const honorific = '\u{FDFA}‏' // ﷺ + RTL mark
    expect(deriveTextContentFromMarkdown(`Prophet Muhammad ${honorific}`)).toBe(
      `Prophet Muhammad ${honorific}`,
    )
  })

  it('trims leading/trailing whitespace left over from stripped markers', () => {
    expect(deriveTextContentFromMarkdown('  # Heading  \n')).toBe('Heading')
  })
})
