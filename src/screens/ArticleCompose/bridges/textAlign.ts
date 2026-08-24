import {BridgeExtension} from '@10play/tentap-editor'
import TextAlign from '@tiptap/extension-text-align'

/**
 * Not part of TenTapStartKit (confirmed against its bridge list) - TipTap's
 * own `@tiptap/extension-text-align` isn't bridged by TenTap out of the box,
 * so this mirrors TenTap's own `ColorBridge` shape
 * (`@10play/tentap-editor/src/bridges/color.ts`) for a settable-attribute
 * mark/node extension. Shared between the native side (`ArticleCompose`'s
 * `bridgeExtensions` list) and the web bundle (`editor-web/AdvancedEditor.tsx`'s
 * `bridges` list) - kept free of any React Native import so Vite can resolve
 * it unmodified for the web build.
 */

export type TextAlignValue = 'left' | 'center' | 'right' | 'justify'

const ALIGN_VALUES: readonly TextAlignValue[] = [
  'left',
  'center',
  'right',
  'justify',
]

type TextAlignEditorState = {
  activeTextAlign: TextAlignValue
}

type TextAlignEditorInstance = {
  setTextAlign: (align: TextAlignValue) => void
}

declare module '@10play/tentap-editor' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface BridgeState extends TextAlignEditorState {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface EditorBridge extends TextAlignEditorInstance {}
}

enum TextAlignActionType {
  SetTextAlign = 'set-text-align',
}

type SetTextAlignMessage = {
  type: TextAlignActionType.SetTextAlign
  payload: TextAlignValue
}

export const TextAlignBridge = new BridgeExtension<
  TextAlignEditorState,
  TextAlignEditorInstance,
  SetTextAlignMessage
>({
  /**
   * `as never` - this app already has TipTap v2 installed for the unrelated
   * web post-composer (`@tiptap/core@^2.9.1`), which wins top-level hoisting
   * since it's a direct dependency; `@tiptap/extension-text-align`'s peer on
   * `@tiptap/core@^3.11.0` incorrectly resolves against that v2 instance
   * despite the `packageExtensions` override in `pnpm-workspace.yaml` (pnpm
   * peer resolution doesn't seem to respect it here - worth revisiting with
   * a cleaner fix, e.g. hand-writing this extension directly, if this
   * mismatch ever causes a real runtime issue rather than just a type one).
   */
  tiptapExtension: TextAlign.configure({
    types: ['heading', 'paragraph'],
    defaultAlignment: 'left',
  }) as never,
  onBridgeMessage: (editor, {type, payload}) => {
    switch (type) {
      case TextAlignActionType.SetTextAlign: {
        // Same v2/v3 peer mismatch as above - typed narrowly instead of
        // reaching for `any`.
        const chain = editor.chain().focus() as unknown as {
          setTextAlign: (align: TextAlignValue) => {run: () => void}
        }
        chain.setTextAlign(payload).run()
        break
      }
    }
    return false
  },
  extendEditorInstance: sendBridgeMessage => {
    return {
      setTextAlign: align =>
        sendBridgeMessage({
          type: TextAlignActionType.SetTextAlign,
          payload: align,
        }),
    }
  },
  extendEditorState: editor => {
    return {
      activeTextAlign:
        ALIGN_VALUES.find(align => editor.isActive({textAlign: align})) ??
        'left',
    }
  },
})
