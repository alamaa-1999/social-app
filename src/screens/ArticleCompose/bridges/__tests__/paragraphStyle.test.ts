/**
 * @jest-environment jsdom
 *
 * `paragraphStyle.ts` imports `BridgeExtension` from the bare
 * `@10play/tentap-editor` root, which eagerly pulls in `RichText.tsx` ->
 * `react-native-webview` (fatal under Jest) and, past that,
 * `webEditorUtils/focusListener.tsx`'s module-load-time
 * `window.addEventListener` (fatal under Jest's default non-browser
 * environment) - same two-layer fix as `underline.test.ts`, needed here
 * purely to import the bridge under test, unrelated to the mock-editor
 * strategy below.
 */
jest.mock('react-native-webview', () => ({}))

/**
 * Tests `ParagraphStyleBridge` against a mock editor (records chain calls)
 * rather than a real, interactive `@tiptap/core` `Editor`. Tried the real
 * thing first and hit a genuine, reproducible wall, not a fluke: mixing
 * `tiptap-core-fixed`'s pinned `Editor` with bare-imported
 * `Heading`/`Blockquote`/`extension-list` throws `RangeError: Can not
 * convert <> to a Fragment (looks like multiple versions of
 * prosemirror-model were loaded)` the moment a real chain command
 * (`setBlockquote`, `toggleOrderedList`) actually runs a transaction -
 * `tiptap-core-fixed`'s alias creates a genuinely separate physical
 * package copy by design (the same mechanism that fixed the v2/v3 issue
 * elsewhere this session), so its own nested `prosemirror-model` is a
 * different instance than whatever the bare-imported extensions carry,
 * even at the identical version number. `serializer/__tests__/index.test.ts`
 * gets away with a similar-looking mix only because `MarkdownManager`
 * parses/serializes against schema specs - it never runs a live chain
 * command like `wrapIn`/`toggleList` that constructs new document
 * fragments at runtime, which is exactly where this breaks.
 *
 * This does mean the test below verifies "does the bridge call the right
 * TipTap commands, in the right order, with the right arguments" rather
 * than "does the resulting document come out correct end-to-end" - a real
 * trade-off, not a silent one, and one that let a real bug through: an
 * earlier version of this test asserted `setTextDirection` got called as
 * its own chain step after `updateAttributes`, on the strength of
 * `paragraphStyle.ts`'s own (also since-corrected) doc comment claiming it
 * was "a real, directly-confirmed TipTap command." A live device click-
 * through later in the same project found that claim false - the mock
 * happily recorded a call to a method name that does not actually exist as
 * a callable command on the real interactive editor, so this suite passed
 * green the entire time the real dropdown silently did nothing. Fixed on
 * both sides together: `paragraphStyle.ts` now folds `dir` into the same
 * `updateAttributes(...)` call instead of chaining a separate
 * `setTextDirection(...)`, and the assertions below were updated to match -
 * a concrete reminder that a mock only proves the code calls what the mock
 * was told to expect, never that the real API surface matches.
 */

import {type ParagraphStyleId} from '../../state'
import {ParagraphStyleBridge} from '../paragraphStyle'

type RecordedCall = {method: string; args: unknown[]}

const CHAIN_METHODS = [
  'focus',
  'clearNodes',
  'setHeading',
  'setBlockquote',
  'toggleBulletList',
  'toggleOrderedList',
  'updateAttributes',
  'run',
] as const

function makeMockEditor(options?: {
  /**
   * Full control over `isActive`, since the real bridge calls it both
   * bare (`isActive('blockquote')`) and attrs-qualified
   * (`isActive('heading', {level: 1})`) - a flat name->boolean map can't
   * distinguish "heading level 1 is active" from "heading level 2 is
   * active", so tests that care about a specific level supply this
   * directly instead.
   */
  isActive?: (name: string, attrs?: Record<string, unknown>) => boolean
  attrs?: Record<string, Record<string, unknown>>
}) {
  const calls: RecordedCall[] = []
  const chain: Record<string, (...args: unknown[]) => unknown> = {}
  for (const method of CHAIN_METHODS) {
    chain[method] = (...args: unknown[]) => {
      calls.push({method, args})
      return chain
    }
  }
  const editor = {
    chain: () => chain,
    isActive: (name: string, attrs?: Record<string, unknown>) =>
      options?.isActive?.(name, attrs) ?? false,
    getAttributes: (name: string) => options?.attrs?.[name] ?? {},
  }
  return {editor, calls}
}

function dispatch(editor: unknown, id: ParagraphStyleId) {
  return ParagraphStyleBridge.onBridgeMessage?.(
    editor as never,
    {type: 'set-paragraph-style' as never, payload: id},
    () => {},
  )
}

/** Method names only, in call order - the assertion shape every test below actually cares about. */
function methodSequence(calls: RecordedCall[]): string[] {
  return calls.map(c => c.method)
}

describe('ParagraphStyleBridge.onBridgeMessage - dispatch logic per target style', () => {
  it('always starts with focus().clearNodes(), regardless of target', () => {
    const {editor, calls} = makeMockEditor()
    dispatch(editor, 'title')
    expect(calls[0]).toEqual({method: 'focus', args: []})
    expect(calls[1]).toEqual({method: 'clearNodes', args: []})
  })

  it('title -> setHeading({level: 1})', () => {
    const {editor, calls} = makeMockEditor()
    dispatch(editor, 'title')
    expect(methodSequence(calls)).toEqual([
      'focus',
      'clearNodes',
      'setHeading',
      'run',
    ])
    expect(calls[2].args).toEqual([{level: 1}])
  })

  it('subheading1 -> setHeading({level: 2})', () => {
    const {editor, calls} = makeMockEditor()
    dispatch(editor, 'subheading1')
    expect(calls[2]).toEqual({method: 'setHeading', args: [{level: 2}]})
  })

  it('subheading2 -> setHeading({level: 3})', () => {
    const {editor, calls} = makeMockEditor()
    dispatch(editor, 'subheading2')
    expect(calls[2]).toEqual({method: 'setHeading', args: [{level: 3}]})
  })

  it('paragraph -> clearNodes only, no further command', () => {
    const {editor, calls} = makeMockEditor()
    dispatch(editor, 'paragraph')
    expect(methodSequence(calls)).toEqual(['focus', 'clearNodes', 'run'])
  })

  it('arabicParagraph -> updateAttributes(paragraph, {typography: arabicParagraph, dir: rtl, textAlign: justify})', () => {
    const {editor, calls} = makeMockEditor()
    dispatch(editor, 'arabicParagraph')
    expect(methodSequence(calls)).toEqual([
      'focus',
      'clearNodes',
      'updateAttributes',
      'run',
    ])
    expect(calls[2].args).toEqual([
      'paragraph',
      {typography: 'arabicParagraph', dir: 'rtl', textAlign: 'justify'},
    ])
  })

  it('blockQuote -> setBlockquote only, no typography/direction change', () => {
    const {editor, calls} = makeMockEditor()
    dispatch(editor, 'blockQuote')
    expect(methodSequence(calls)).toEqual([
      'focus',
      'clearNodes',
      'setBlockquote',
      'run',
    ])
  })

  it('arabicBlockQuote -> setBlockquote, updateAttributes(blockquote, {typography: arabicQuote, dir: rtl}), then updateAttributes(paragraph, {textAlign: center})', () => {
    const {editor, calls} = makeMockEditor()
    dispatch(editor, 'arabicBlockQuote')
    expect(methodSequence(calls)).toEqual([
      'focus',
      'clearNodes',
      'setBlockquote',
      'updateAttributes',
      'updateAttributes',
      'run',
    ])
    expect(calls[3].args).toEqual([
      'blockquote',
      {typography: 'arabicQuote', dir: 'rtl'},
    ])
    expect(calls[4].args).toEqual(['paragraph', {textAlign: 'center'}])
  })

  it('bulletedList -> toggleBulletList only', () => {
    const {editor, calls} = makeMockEditor()
    dispatch(editor, 'bulletedList')
    expect(methodSequence(calls)).toEqual([
      'focus',
      'clearNodes',
      'toggleBulletList',
      'run',
    ])
  })

  it('numberedList -> toggleOrderedList only', () => {
    const {editor, calls} = makeMockEditor()
    dispatch(editor, 'numberedList')
    expect(methodSequence(calls)).toEqual([
      'focus',
      'clearNodes',
      'toggleOrderedList',
      'run',
    ])
  })

  it('ignores messages of a different type entirely, no chain touched at all', () => {
    const {editor, calls} = makeMockEditor()
    ParagraphStyleBridge.onBridgeMessage?.(
      editor as never,
      {type: 'some-other-type' as never, payload: 'title'},
      () => {},
    )
    expect(calls).toEqual([])
  })
})

describe('ParagraphStyleBridge.extendEditorState - activeParagraphStyle precedence, mirrors the retired detectParagraphStyle exactly', () => {
  function state(options?: {
    isActive?: (name: string, attrs?: Record<string, unknown>) => boolean
    attrs?: Record<string, Record<string, unknown>>
  }) {
    const {editor} = makeMockEditor(options)
    return ParagraphStyleBridge.extendEditorState?.(editor as never) as {
      activeParagraphStyle: ParagraphStyleId
    }
  }

  it('defaults to paragraph when nothing else is active', () => {
    expect(state().activeParagraphStyle).toBe('paragraph')
  })

  it('blockquote without arabic-quote typography reads as blockQuote', () => {
    expect(
      state({isActive: name => name === 'blockquote'}).activeParagraphStyle,
    ).toBe('blockQuote')
  })

  it('blockquote with arabic-quote typography reads as arabicBlockQuote, blockquote checked before typography', () => {
    expect(
      state({
        isActive: name => name === 'blockquote',
        attrs: {blockquote: {typography: 'arabicQuote'}},
      }).activeParagraphStyle,
    ).toBe('arabicBlockQuote')
  })

  it('arabicParagraph typography on a plain paragraph (no blockquote) reads as arabicParagraph', () => {
    expect(
      state({attrs: {paragraph: {typography: 'arabicParagraph'}}})
        .activeParagraphStyle,
    ).toBe('arabicParagraph')
  })

  it.each([
    [1, 'title'],
    [2, 'subheading1'],
    [3, 'subheading2'],
  ] as const)('heading level %d reads as %s', (level, expected) => {
    expect(
      state({
        isActive: (name, attrs) => name === 'heading' && attrs?.level === level,
      }).activeParagraphStyle,
    ).toBe(expected)
  })

  it('heading level 2 does not get mistaken for level 1 or 3 - exact attrs match required', () => {
    const s = state({
      isActive: (name, attrs) => name === 'heading' && attrs?.level === 2,
    })
    expect(s.activeParagraphStyle).toBe('subheading1')
    expect(s.activeParagraphStyle).not.toBe('title')
    expect(s.activeParagraphStyle).not.toBe('subheading2')
  })

  it('bulletList reads as bulletedList', () => {
    expect(
      state({isActive: name => name === 'bulletList'}).activeParagraphStyle,
    ).toBe('bulletedList')
  })

  it('orderedList reads as numberedList', () => {
    expect(
      state({isActive: name => name === 'orderedList'}).activeParagraphStyle,
    ).toBe('numberedList')
  })
})
