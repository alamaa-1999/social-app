import {BridgeExtension} from '@10play/tentap-editor'
import {Extension} from '@tiptap/core'

/**
 * Inserts an honorific glyph at the cursor - plain text, no facet involved
 * (matches `state.ts`'s retired `onInsertHonorific`/`RTL_MARK` exactly:
 * `String.fromCodePoint(codepoint) + RTL_MARK`). The RTL mark (U+200F) is
 * mandatory per the honorific spec, keeping the inserted glyph rendering
 * right-to-left regardless of surrounding text direction - see
 * `Toolbar.tsx`'s own `RTL_MARK` export and `HONORIFICS` codepoint table,
 * both unchanged by this migration and reused as-is once `Toolbar.tsx` is
 * rewired to call this bridge instead of `state.ts`'s `insertText`.
 */

const RTL_MARK = '‏'

const honorificExtension = Extension.create({name: 'honorific'})

type HonorificEditorInstance = {
  insertHonorific: (codepoint: number) => void
}

declare module '@10play/tentap-editor' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface EditorBridge extends HonorificEditorInstance {}
}

enum HonorificActionType {
  InsertHonorific = 'insert-honorific',
}

type InsertHonorificMessage = {
  type: HonorificActionType.InsertHonorific
  payload: number
}

export const HonorificBridge = new BridgeExtension<
  unknown,
  HonorificEditorInstance,
  InsertHonorificMessage
>({
  tiptapExtension: honorificExtension as never,
  onBridgeMessage: (editor, {type, payload}) => {
    switch (type) {
      case HonorificActionType.InsertHonorific: {
        const text = String.fromCodePoint(payload) + RTL_MARK
        const chain = editor.chain().focus() as unknown as {
          insertContent: (content: string) => {run: () => void}
        }
        chain.insertContent(text).run()
        break
      }
    }
    return false
  },
  extendEditorInstance: sendBridgeMessage => {
    return {
      insertHonorific: codepoint =>
        sendBridgeMessage({
          type: HonorificActionType.InsertHonorific,
          payload: codepoint,
        }),
    }
  },
})
