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
 * gives alignment. RTL rendering itself comes from TipTap core's own
 * `TextDirection` extension (confirmed directly against `@tiptap/core`'s
 * source: a real core extension, enabled by default via
 * `enableCoreExtensions`, adding a global `dir` attribute to every node
 * type - not something this needs to reimplement), set as a plain attribute
 * alongside `typography` in the same `updateAttributes` call rather than via
 * a separate `setTextDirection` chain command.
 *
 * That last point was wrong in an earlier draft of this comment, which
 * claimed the v2/v3 `@tiptap/core` peer mismatch was "confirmed not to
 * affect runtime behavior via live device testing" - a real live click-
 * through later in the same project (see `paragraphStyle.ts`, which had the
 * identical `.setTextDirection(...)` pattern) found this false:
 * `setTextDirection` throws `TypeError: ... is not a function` on the real
 * interactive editor, not just a type-visibility gap. Fixed here to match.
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
        // not just the type-only mismatch this file's comment used to
        // assume. `dir` itself is a real global attribute (TipTap core's
        // own TextDirection extension, enabled by default), so setting it
        // as a plain attribute alongside `typography` works the same way
        // `typography` itself already does.
        const chain = editor.chain().focus() as unknown as {
          updateAttributes: (
            typeOrName: string,
            attrs: Record<string, unknown>,
          ) => {run: () => void}
        }
        chain
          .updateAttributes(nodeType, {
            typography: payload ?? null,
            dir: payload ? 'rtl' : 'ltr',
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
