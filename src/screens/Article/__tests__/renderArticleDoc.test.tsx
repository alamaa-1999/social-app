import {describe, expect, it, jest} from '@jest/globals'
import {render} from '@testing-library/react-native'

import {renderArticleDoc} from '../renderArticleDoc'

/*
 * `ArticleImage` pulls in `#/alf` -> `#/components/Layout` ->
 * `#/components/Dialog` -> `react-native-reanimated`, which needs native
 * worklets this project's Jest setup has never had to initialize before -
 * nothing has rendered a Dialog-adjacent component in a test until this
 * file. None of the cases below exercise an `image` node, so mocking it
 * away here is the correctly-scoped fix: it isolates these typography tests
 * from unrelated, heavy machinery rather than papering over a real gap with
 * a project-wide Jest config change this file has no business making.
 * `jest.mock` calls are hoisted above imports by Babel regardless of source
 * position, so this still applies before `renderArticleDoc` above resolves
 * its own import of `ArticleImage`.
 */
jest.mock('../ArticleImage', () => ({ArticleImage: () => null}))

/**
 * Stands in for `useTheme()`'s resolved colors, which `ArticleView.tsx`
 * (the real, sole caller) always provides - `renderArticleDoc` has no way
 * to call the hook itself, since it's plain functions, not a component.
 * Distinct light/dark-ish values so a test asserting on `.color` would
 * actually notice if the wrong one leaked through, though none currently do.
 */
const TEST_COLORS = {text: '#111111', link: '#2222ff'}

/**
 * Fixtures mirror the shape `applyFacetsToParsedDoc` actually produces (see
 * `editor-web/serializer/__tests__/index.test.ts` for the same node shapes
 * on the save/load side) - not hand-invented, so a real regression in either
 * pipeline would show up here as a mismatch against what this file expects.
 */

function textNode(
  text: string,
  marks: Array<{type: string; attrs?: Record<string, unknown>}> = [],
) {
  return {type: 'text', text, marks}
}

type RenderedJSON = {
  type: string
  props: Record<string, unknown>
  children: RenderedJSON[] | null
} | null

/** Counts rendered nodes carrying a `borderLeftWidth` style - used to check
 * that several merged blockquotes share exactly one bordered container
 * rather than one apiece, without relying on test-instance reference
 * identity (`.parent`), which RNTL doesn't guarantee is stable across
 * separate property accesses. */
function countNodesWithBorderLeft(
  json: RenderedJSON | RenderedJSON[] | string,
): number {
  if (json == null || typeof json === 'string') return 0
  if (Array.isArray(json)) {
    return json.reduce((sum, node) => sum + countNodesWithBorderLeft(node), 0)
  }
  const style = Object.assign({}, ...[json.props.style].flat(Infinity))
  const own = style.borderLeftWidth != null ? 1 : 0
  return own + countNodesWithBorderLeft(json.children ?? [])
}

describe('renderArticleDoc - typography', () => {
  it('renders an English paragraph left-to-right with no writingDirection override', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: {},
          content: [textNode('Hello world')],
        },
      ],
    }
    const {getByText} = render(
      <>{renderArticleDoc(doc, {colors: TEST_COLORS})}</>,
    )
    const node = getByText('Hello world')
    const flatStyle = Object.assign({}, ...[node.props.style].flat(Infinity))
    expect(flatStyle.writingDirection).toBeUndefined()
    expect(flatStyle.fontFamily).toBe('Vollkorn')
  })

  it(
    "renders an arabicParagraph with writingDirection 'rtl', justified, and " +
      "the Scheherazade New font - mirroring paragraphStyle.ts's own " +
      'arabicParagraph -> {dir: rtl, textAlign: justify} mapping exactly, ' +
      'since dir is derived here, never read off a stored attribute',
    () => {
      const doc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: {typography: 'arabicParagraph', textAlign: 'justify'},
            content: [textNode('مرحبا بالعالم')],
          },
        ],
      }
      const {getByText} = render(
        <>{renderArticleDoc(doc, {colors: TEST_COLORS})}</>,
      )
      const node = getByText('مرحبا بالعالم')
      const flatStyle = Object.assign({}, ...[node.props.style].flat(Infinity))
      expect(flatStyle.writingDirection).toBe('rtl')
      expect(flatStyle.textAlign).toBe('justify')
      expect(flatStyle.fontFamily).toBe('Scheherazade New')
    },
  )

  it(
    'splits an arabicQuote blockquote correctly between its verse (centered, ' +
      'rtl) and its English translation (left, ltr) - using textAlign, not ' +
      'position, as the real persisted signal for which paragraph is which',
    () => {
      const doc = {
        type: 'doc',
        content: [
          {
            type: 'blockquote',
            attrs: {typography: 'arabicQuote'},
            content: [
              {
                type: 'paragraph',
                attrs: {textAlign: 'center'},
                content: [textNode('بسم الله')],
              },
              {
                type: 'paragraph',
                attrs: {},
                content: [textNode('In the name of Allah')],
              },
            ],
          },
        ],
      }
      const {getByText} = render(
        <>{renderArticleDoc(doc, {colors: TEST_COLORS})}</>,
      )
      const verse = getByText('بسم الله')
      const verseStyle = Object.assign(
        {},
        ...[verse.props.style].flat(Infinity),
      )
      expect(verseStyle.writingDirection).toBe('rtl')
      expect(verseStyle.textAlign).toBe('center')
      expect(verseStyle.fontFamily).toBe('Scheherazade New')

      const translation = getByText('In the name of Allah')
      const translationStyle = Object.assign(
        {},
        ...[translation.props.style].flat(Infinity),
      )
      expect(translationStyle.writingDirection).toBeUndefined()
      expect(translationStyle.fontFamily).toBe('Vollkorn')
    },
  )

  it(
    'merges two consecutive top-level blockquotes into one shared bordered ' +
      "container - Figma's own left border is a continuous line down a " +
      "quote block's own paragraphs, and two blockquote nodes placed back " +
      'to back in the source document read the same way visually, not as ' +
      'two disconnected quotes that happen to be adjacent',
    () => {
      const doc = {
        type: 'doc',
        content: [
          {
            type: 'blockquote',
            attrs: {},
            content: [
              {
                type: 'paragraph',
                attrs: {},
                content: [textNode('first quote')],
              },
            ],
          },
          {
            type: 'blockquote',
            attrs: {},
            content: [
              {
                type: 'paragraph',
                attrs: {},
                content: [textNode('second quote')],
              },
            ],
          },
        ],
      }
      const {getByText, toJSON} = render(
        <>{renderArticleDoc(doc, {colors: TEST_COLORS})}</>,
      )
      expect(getByText('first quote')).toBeTruthy()
      expect(getByText('second quote')).toBeTruthy()

      // exactly one bordered container in the whole tree - not one per
      // blockquote, which is what a broken border-flow would look like
      const borderedNodes = countNodesWithBorderLeft(toJSON())
      expect(borderedNodes).toBe(1)
    },
  )

  it(
    'falls back to detecting real Arabic script for the verse when no ' +
      'paragraph carries a textAlign facet at all - confirmed directly ' +
      "against a real, already-published article's own stored record, " +
      'which has `typography: arabicQuote` on the blockquote and no ' +
      'per-paragraph textAlign facet whatsoever, so the verse fell through ' +
      'to quoteEn/Vollkorn until this fallback existed',
    () => {
      const doc = {
        type: 'doc',
        content: [
          {
            type: 'blockquote',
            attrs: {typography: 'arabicQuote'},
            content: [
              {
                type: 'paragraph',
                attrs: {},
                content: [textNode('بسم الله')],
              },
              {
                type: 'paragraph',
                attrs: {},
                content: [textNode('In the name of Allah')],
              },
            ],
          },
        ],
      }
      const {getByText} = render(
        <>{renderArticleDoc(doc, {colors: TEST_COLORS})}</>,
      )
      const verse = getByText('بسم الله')
      const verseStyle = Object.assign(
        {},
        ...[verse.props.style].flat(Infinity),
      )
      expect(verseStyle.writingDirection).toBe('rtl')
      expect(verseStyle.textAlign).toBe('center')
      expect(verseStyle.fontFamily).toBe('Scheherazade New')

      const translation = getByText('In the name of Allah')
      const translationStyle = Object.assign(
        {},
        ...[translation.props.style].flat(Infinity),
      )
      expect(translationStyle.fontFamily).toBe('Vollkorn')
    },
  )

  it(
    'pins a bidiIsolate-marked honorific to Scheherazade New even inside a ' +
      'plain English paragraph - real articles embed honorifics like this ' +
      '("Ibn Taymiyah ﵀") inline in ordinary prose, not just inside ' +
      "arabicParagraph blocks, and Vollkorn (the paragraph's own font) has " +
      'no glyph for U+FD40-FDFF, so leaving the mark unstyled meant the ' +
      'browser silently substituted its own fallback for just that glyph',
    () => {
      const doc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: {},
            content: [
              textNode('Ibn Taymiyah '),
              textNode('﵀', [{type: 'bidiIsolate'}]),
              textNode(' said...'),
            ],
          },
        ],
      }
      const {getByText} = render(
        <>{renderArticleDoc(doc, {colors: TEST_COLORS})}</>,
      )
      const honorific = getByText('﵀')
      const honorificStyle = Object.assign(
        {},
        ...[honorific.props.style].flat(Infinity),
      )
      expect(honorificStyle.fontFamily).toBe('Scheherazade New')

      // the surrounding English text is untouched - Vollkorn, not swept
      // into the honorific's own font override
      const surrounding = getByText('Ibn Taymiyah', {exact: false})
      const surroundingStyle = Object.assign(
        {},
        ...[surrounding.props.style].flat(Infinity),
      )
      expect(surroundingStyle.fontFamily).toBe('Vollkorn')
    },
  )

  it('re-validates a color mark and drops a value that fails isAllowedColorValue', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: {},
          content: [
            textNode('safe', [{type: 'textStyle', attrs: {color: '#006aff'}}]),
            textNode('unsafe', [
              {
                type: 'textStyle',
                attrs: {color: 'javascript:alert(1)'},
              },
            ]),
          ],
        },
      ],
    }
    const rendered = render(<>{renderArticleDoc(doc, {colors: TEST_COLORS})}</>)
    const safe = rendered.getByText('safe')
    const safeStyle = Object.assign({}, ...[safe.props.style].flat(Infinity))
    expect(safeStyle.color).toBe('#006aff')

    // "unsafe" itself renders as a bare string, not its own queryable <Text>
    // node - the invalid color mark is correctly dropped rather than wrapped,
    // so there's no separate element to inspect a style on. The property
    // under test is that the malicious value never reaches a `color` style
    // anywhere in the tree at all.
    const serialized = JSON.stringify(rendered.toJSON())
    expect(serialized).toContain('unsafe')
    expect(serialized).not.toContain('javascript:alert(1)')
  })

  it('renders an unrecognized node type by rendering its children, discarding the wrapper', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'someFutureNodeType',
          content: [
            {
              type: 'paragraph',
              attrs: {},
              content: [textNode('still here')],
            },
          ],
        },
      ],
    }
    const {getByText} = render(
      <>{renderArticleDoc(doc, {colors: TEST_COLORS})}</>,
    )
    expect(getByText('still here')).toBeTruthy()
  })
})
