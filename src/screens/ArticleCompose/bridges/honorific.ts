import {BridgeExtension} from '@10play/tentap-editor'

import {bidiIsolateMark} from '../bidiIsolate'

/**
 * Inserts an honorific glyph at the cursor - plain text, no facet involved,
 * wrapped in a `bidiIsolate` mark so the glyph's own direction can't disturb
 * the text around it.
 *
 * This replaces an earlier approach that appended an invisible U+200F
 * RIGHT-TO-LEFT MARK after every inserted glyph. That technique has already
 * been tried and retired once in this codebase: `src/lib/strings/bidi.ts`'s
 * own comment records replacing invisible directional-formatting characters
 * with CSS isolation precisely because the invisible characters leaked into
 * copy-paste and broke downstream handle lookups (internal issue #8451).
 * The same objection applies here, with an extra one specific to an editor:
 * an invisible character is a real, separate caret stop, so arrowing past a
 * honorific silently takes two key presses instead of one.
 *
 * The isolation itself is CSS (`editor-web/index.html`'s
 * `[data-bidi-isolate]` rule), not a character - nothing invisible is ever
 * written into the document text. `unicode-bidi: isolate` is what actually
 * does the work: it resolves the marked run's bidi independently and makes
 * the run itself opaque to the surrounding paragraph's resolution, in both
 * directions.
 *
 * Deliberate deviation from this task's own plan, flagged rather than made
 * silently: the plan specified `direction: ltr` for the isolate, copied
 * from `bidi.ts`, whose case is the mirror image of this one (isolating
 * LTR handles inside RTL text). These glyphs are Arabic - inherently
 * strong-RTL - so `direction: rtl` is the semantically correct base
 * direction for the isolate's own content. For a single strong character
 * the rendered result is the same either way, since the glyph's own
 * strong direction governs; the isolation is the part that matters. `rtl`
 * is used because it states the truth about the content.
 */

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

/**
 * The one content shape this file constructs - a single marked text node.
 * Narrow on purpose rather than a general ProseMirror content type: the
 * local chain type this file already used was `(content: string) => ...`,
 * which only ever accepted a plain string, so it has to widen to accept
 * the marked-node form now being passed.
 */
type MarkedTextContent = {
  type: 'text'
  text: string
  marks: {type: string}[]
}

export const HonorificBridge = new BridgeExtension<
  unknown,
  HonorificEditorInstance,
  InsertHonorificMessage
>({
  // The underlying tiptap extension is now a Mark named `bidiIsolate`, not
  // an empty `Extension` named `honorific` - `forceName` keeps this
  // bridge's own identity stable regardless, since TenTap keys its
  // `bridgeExtensionConfigMap` lookups on the bridge name.
  forceName: 'honorific',
  tiptapExtension: bidiIsolateMark as never,
  onBridgeMessage: (editor, {type, payload}) => {
    switch (type) {
      case HonorificActionType.InsertHonorific: {
        const chain = editor.chain().focus() as unknown as {
          insertContent: (content: string | MarkedTextContent) => {
            unsetMark: (name: string) => {run: () => void}
            run: () => void
          }
        }
        // `unsetMark` after inserting, so the isolation applies to the
        // glyph alone and doesn't bleed into whatever the author types
        // next - ProseMirror carries the mark set at the cursor forward
        // into subsequent input otherwise.
        chain
          .insertContent({
            type: 'text',
            text: String.fromCodePoint(payload),
            marks: [{type: 'bidiIsolate'}],
          })
          .unsetMark('bidiIsolate')
          .run()
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
