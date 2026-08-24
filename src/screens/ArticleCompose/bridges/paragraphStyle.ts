import {BridgeExtension} from '@10play/tentap-editor'

import {type ParagraphStyleId} from '../state'

/**
 * Unifies Heading/Blockquote/BulletList/OrderedList/`TypographyBridge` into
 * the single `setParagraphStyle`/`activeParagraphStyle` surface
 * `Toolbar.tsx`'s 9-option dropdown actually needs - replaces `state.ts`'s
 * retired `onSelectParagraphStyle`/`detectParagraphStyle`, same 9 options,
 * same precedence, now driven by live editor state instead of parsing
 * markdown-prefix conventions by hand. Needs no `tiptapExtension` of its
 * own - it only orchestrates node types Heading/Blockquote/BulletList/
 * OrderedList/`TypographyBridge` already register, all of which must stay
 * present in the same `bridges`/`bridgeExtensions` list as this bridge.
 *
 * `clearNodes()` (a real, built-in `@tiptap/core` command - confirmed
 * directly in the compiled source, not just inferred from a docs page)
 * does the heavy lifting for every transition: it resets the current
 * block to a plain paragraph via `setNodeMarkup(pos, defaultType)` with no
 * explicit `attrs`, which resets every global attribute (including this
 * app's own `typography`/`dir`) to its schema default, and separately
 * lifts the block out of any wrapping list/blockquote via `tr.lift(...)`.
 * Calling it first, unconditionally, means every `case` below only needs
 * to describe the *target* shape, never the many possible *current*
 * shapes it might be converting from - no hand-written
 * `isActive('bulletList') ? toggleBulletList() : ...` matrix to keep in
 * sync with every other case.
 */

type ParagraphStyleEditorState = {
  activeParagraphStyle: ParagraphStyleId
}

type ParagraphStyleEditorInstance = {
  setParagraphStyle: (id: ParagraphStyleId) => void
}

declare module '@10play/tentap-editor' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface BridgeState extends ParagraphStyleEditorState {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface EditorBridge extends ParagraphStyleEditorInstance {}
}

enum ParagraphStyleActionType {
  SetParagraphStyle = 'set-paragraph-style',
}

type SetParagraphStyleMessage = {
  type: ParagraphStyleActionType.SetParagraphStyle
  payload: ParagraphStyleId
}

/**
 * Same untyped-chain reasoning as `textAlign.ts`/`typography.ts`: every
 * command used here (`clearNodes`, `setHeading`, `setBlockquote`,
 * `toggleBulletList`, `toggleOrderedList`, `updateAttributes`,
 * `setTextDirection`) is a real `@tiptap/core`/extension command, just not
 * visible to TS through this app's mismatched-version `@tiptap/core`
 * import.
 */
type UntypedChain = {
  clearNodes: () => UntypedChain
  setHeading: (attrs: {level: 1 | 2 | 3 | 4 | 5 | 6}) => UntypedChain
  setBlockquote: () => UntypedChain
  toggleBulletList: () => UntypedChain
  toggleOrderedList: () => UntypedChain
  updateAttributes: (
    typeOrName: string,
    attrs: Record<string, unknown>,
  ) => UntypedChain
  setTextDirection: (direction: 'ltr' | 'rtl' | 'auto') => UntypedChain
  run: () => void
}

export const ParagraphStyleBridge = new BridgeExtension<
  ParagraphStyleEditorState,
  ParagraphStyleEditorInstance,
  SetParagraphStyleMessage
>({
  forceName: 'paragraphStyle',
  onBridgeMessage: (editor, {type, payload}) => {
    if (type !== ParagraphStyleActionType.SetParagraphStyle) return false
    let chain = (editor.chain().focus() as unknown as UntypedChain).clearNodes()
    switch (payload) {
      case 'title':
        chain = chain.setHeading({level: 1})
        break
      case 'subheading1':
        chain = chain.setHeading({level: 2})
        break
      case 'subheading2':
        chain = chain.setHeading({level: 3})
        break
      case 'paragraph':
        break
      case 'arabicParagraph':
        // Figma (article/body-ar, node 16:22) specifies text-align: justify
        // for Arabic body paragraphs, not right - `dir: 'rtl'` alone only
        // fixes bidi/reading order, it doesn't touch text-align, and
        // `textAlign.ts`'s own extension defaults every paragraph to
        // `left` regardless of direction, so this has to be set explicitly.
        chain = chain.updateAttributes('paragraph', {
          typography: 'arabicParagraph',
          dir: 'rtl',
          textAlign: 'justify',
        })
        break
      case 'blockQuote':
        chain = chain.setBlockquote()
        break
      case 'arabicBlockQuote':
        // Figma (article/quote-ar-verse, node 16:22) centers the Arabic
        // quote's own paragraph text - the surrounding indented-quote
        // border/padding is shared, unstyled-direction chrome (see
        // editor-web/index.html's `blockquote` rule), only the text
        // alignment differs between the English and Arabic quote variants.
        // Targets 'paragraph' (the blockquote's inner text node), not
        // 'blockquote' itself - `textAlign.ts`'s extension is only
        // registered on `heading`/`paragraph` types.
        chain = chain
          .setBlockquote()
          .updateAttributes('blockquote', {
            typography: 'arabicQuote',
            dir: 'rtl',
          })
          .updateAttributes('paragraph', {textAlign: 'center'})
        break
      case 'bulletedList':
        chain = chain.toggleBulletList()
        break
      case 'numberedList':
        chain = chain.toggleOrderedList()
        break
    }
    chain.run()
    return false
  },
  extendEditorInstance: sendBridgeMessage => {
    return {
      setParagraphStyle: id =>
        sendBridgeMessage({
          type: ParagraphStyleActionType.SetParagraphStyle,
          payload: id,
        }),
    }
  },
  extendEditorState: editor => {
    const typography = (
      editor.isActive('blockquote')
        ? editor.getAttributes('blockquote').typography
        : editor.getAttributes('paragraph').typography
    ) as 'arabicParagraph' | 'arabicQuote' | null | undefined
    return {
      activeParagraphStyle: detectActiveParagraphStyle(editor, typography),
    }
  },
})

/**
 * Mirrors `state.ts`'s retired `detectParagraphStyle` precedence exactly:
 * blockquote (arabic-quote-qualified) first, then arabic-paragraph
 * typography, then heading levels, then the two list types, default
 * plain paragraph.
 */
function detectActiveParagraphStyle(
  editor: {
    isActive: (name: string, attrs?: Record<string, unknown>) => boolean
  },
  typography: 'arabicParagraph' | 'arabicQuote' | null | undefined,
): ParagraphStyleId {
  if (editor.isActive('blockquote')) {
    return typography === 'arabicQuote' ? 'arabicBlockQuote' : 'blockQuote'
  }
  if (typography === 'arabicParagraph') return 'arabicParagraph'
  if (editor.isActive('heading', {level: 1})) return 'title'
  if (editor.isActive('heading', {level: 2})) return 'subheading1'
  if (editor.isActive('heading', {level: 3})) return 'subheading2'
  if (editor.isActive('bulletList')) return 'bulletedList'
  if (editor.isActive('orderedList')) return 'numberedList'
  return 'paragraph'
}
