import {LinkBridge as DefaultLinkBridge} from '@10play/tentap-editor'

/**
 * Replaces `TenTapStartKit`'s own `LinkBridge` (filtered out of the bridges
 * arrays in `index.tsx`/`editor-web/AdvancedEditor.tsx` for this reason).
 * Only `onBridgeMessage` changes - `extendEditorState` is inherited via
 * `.clone()`, so `isLinkActive`/`canSetLink`/`activeLink` keep working
 * exactly as before, the same reuse-don't-reimplement approach
 * `bridges/underline.ts` already takes.
 *
 * Two real behaviours from the default, both found by the project owner
 * click-testing the Insert-link popover, both fixed here because both live
 * inside the bridge's own command chain where no caller can reach them:
 *
 * 1. **Removing a link did nothing.** The default handler opens with
 *    `if (payload === null) return false` - commented "cancelled" - and
 *    only treats `''` as a removal. Its own TypeScript signature is
 *    `setLink: (link: string | null) => void`, which invites exactly the
 *    wrong call: `null` reads as "no link", and the types give no hint that
 *    it silently means "do nothing". Both `null` and `''` remove here.
 *    There is no cancel case to preserve - this app's popover closes
 *    without sending anything.
 *
 * 2. **The caret jumped to the start of the linked text.** The default
 *    ends both paths with `.setTextSelection(editor.state.selection.from)`,
 *    deliberately collapsing to the *beginning* of the range. Typing
 *    straight after applying a link therefore inserted text in front of it.
 *    Both paths below collapse to the end instead, so writing continues
 *    after the link, which is what authors expect.
 *
 * The end position is read inside a `.command()` callback rather than from
 * `editor.state` up front: `extendMarkRange('link')` widens the selection
 * to the whole link mark as part of this same transaction, so the correct
 * end only exists on the in-flight `tr`, not on the pre-transaction state
 * the default handler samples.
 */

type LinkChain = {
  focus: () => LinkChain
  extendMarkRange: (name: string) => LinkChain
  setLink: (attrs: {href: string}) => LinkChain
  unsetLink: () => LinkChain
  command: (
    fn: (props: {
      tr: {selection: {to: number}}
      commands: {setTextSelection: (pos: number) => boolean}
    }) => boolean,
  ) => LinkChain
  run: () => void
}

/** Collapses the caret to the end of whatever the chain currently spans. */
const caretToEnd = ({
  tr,
  commands,
}: {
  tr: {selection: {to: number}}
  commands: {setTextSelection: (pos: number) => boolean}
}) => commands.setTextSelection(tr.selection.to)

const LinkBridge = DefaultLinkBridge.clone()

LinkBridge.onBridgeMessage = (editor, message) => {
  // Widened to plain strings deliberately. The action name is upstream's
  // `LinkEditorActionType.SetLink` enum, but that enum isn't re-exported
  // from the package root (checked - only the bridge itself is), so it
  // can't be imported to compare against. Reading the message as its
  // underlying wire shape is honest about that and keeps the comparison
  // type-safe, rather than casting at the point of use.
  const {type, payload} = message as unknown as {
    type: string
    payload: string | null
  }
  if (type !== 'set-link') return false

  const chain = (editor.chain() as unknown as LinkChain)
    .focus()
    .extendMarkRange('link')

  if (payload === null || payload === '') {
    chain.unsetLink().command(caretToEnd).run()
    return false
  }

  chain.setLink({href: payload}).command(caretToEnd).run()
  return false
}

export {LinkBridge}
