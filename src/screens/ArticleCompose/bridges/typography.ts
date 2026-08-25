import {BridgeExtension} from '@10play/tentap-editor'
import {Extension} from '@tiptap/core'

/**
 * Marks a paragraph/blockquote as using a named Arabic-typography variant
 * (wire shape: `com.sunnahsky.richtext.facets.blocks#typography`, values
 * `arabicParagraph`/`arabicQuote` - matches `state.ts`'s `FacetFeature`
 * union exactly, the byte-offset engine this migration retires).
 *
 * Not a distinct node type - a custom global attribute on the existing
 * `paragraph`/`blockquote` nodes, the same treatment `textAlign.ts` already
 * gives alignment. `dir` is written here as a plain attribute in the same
 * `updateAttributes` call, never via a separate chain command (an earlier
 * version used `.setTextDirection(...)`, which throws a live `TypeError` on
 * the real editor - see `paragraphStyle.ts`, which had the identical bug).
 *
 * **What makes `dir` a real attribute at all is `editor-web/dirExtension.ts`
 * - see that file's doc comment, which is the single authoritative account.**
 * Deliberately not restated here, even in summary: this comment has now been
 * wrong about that exact mechanism three separate times (claiming
 * `setTextDirection` was callable; then claiming `enableCoreExtensions`
 * registered `dir` by default; then citing a `tiptapOptions.textDirection`
 * setting that the implementation moved past and no longer exists). Each
 * version was accurate when written and went stale one step later, because
 * it restated a mechanism owned by another file. Point at it instead.
 */

export type TypographyValue = 'arabicParagraph' | 'arabicQuote'

const TYPOGRAPHY_NODE_TYPES = ['paragraph', 'blockquote']

const typographyExtension = Extension.create({
  name: 'typography',
  addGlobalAttributes() {
    return [
      {
        types: TYPOGRAPHY_NODE_TYPES,
        attributes: {
          typography: {
            default: null,
            parseHTML: (element: HTMLElement) =>
              element.getAttribute('data-typography'),
            renderHTML: (attributes: {typography?: TypographyValue | null}) => {
              if (!attributes.typography) return {}
              return {'data-typography': attributes.typography}
            },
          },
        },
      },
    ]
  },
})

type TypographyEditorState = {
  activeTypography: TypographyValue | undefined
}

type TypographyEditorInstance = {
  setTypography: (value: TypographyValue | undefined) => void
}

declare module '@10play/tentap-editor' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface BridgeState extends TypographyEditorState {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface EditorBridge extends TypographyEditorInstance {}
}

enum TypographyActionType {
  SetTypography = 'set-typography',
}

type SetTypographyMessage = {
  type: TypographyActionType.SetTypography
  payload: TypographyValue | undefined
}

export const TypographyBridge = new BridgeExtension<
  TypographyEditorState,
  TypographyEditorInstance,
  SetTypographyMessage
>({
  tiptapExtension: typographyExtension as never,
  onBridgeMessage: (editor, {type, payload}) => {
    switch (type) {
      case TypographyActionType.SetTypography: {
        const nodeType = editor.isActive('blockquote')
          ? 'blockquote'
          : 'paragraph'
        // `dir` folded directly into the same updateAttributes call rather
        // than a separate `.setTextDirection()` chain call - confirmed via
        // live device testing (see paragraphStyle.ts, which had the
        // identical bug) that `setTextDirection` is not actually a callable
        // command on the real interactive editor's chain, despite reading
        // as a real @tiptap/core v3 command in source - a live TypeError,
        // not just a type-only mismatch. What makes `dir` a real attribute
        // at all is editor-web/dirExtension.ts (see that file - deliberately
        // not restated here, see this file's own top comment for why).
        const chain = editor.chain().focus() as unknown as {
          updateAttributes: (
            typeOrName: string,
            attrs: Record<string, unknown>,
          ) => {run: () => void}
        }
        chain
          .updateAttributes(nodeType, {
            typography: payload ?? null,
            // `null`, not `'ltr'`, when clearing - see `dirExtension.ts`'s
            // own doc comment: `dir` is an inherited attribute, so writing
            // an explicit `ltr` here would override a legitimately RTL
            // ancestor (an Arabic block quote) rather than returning this
            // node to "no opinion, inherit normally".
            dir: payload ? 'rtl' : null,
          })
          .run()
        break
      }
    }
    return false
  },
  extendEditorInstance: sendBridgeMessage => {
    return {
      setTypography: value =>
        sendBridgeMessage({
          type: TypographyActionType.SetTypography,
          payload: value,
        }),
    }
  },
  extendEditorState: editor => {
    const paragraphTypography = editor.getAttributes('paragraph')
      .typography as TypographyValue | null
    const blockquoteTypography = editor.getAttributes('blockquote')
      .typography as TypographyValue | null
    return {
      activeTypography:
        paragraphTypography ?? blockquoteTypography ?? undefined,
    }
  },
})
