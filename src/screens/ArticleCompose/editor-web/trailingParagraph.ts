import {Extension} from '@tiptap/core'
import {type Node} from '@tiptap/pm/model'
import {Plugin, PluginKey} from '@tiptap/pm/state'

/**
 * Node type names this document must never end on - both effectively leaf
 * nodes (see `imageUploadNode.ts`'s own `atom: true`, and the plain
 * `@tiptap/extension-image` `imageNodeView.ts` extends), neither of which
 * contains any text a click can resolve a cursor into.
 */
const NOT_LAST_NODE_TYPES = new Set(['imageUpload', 'image'])

function needsTrailingParagraph(doc: Node): boolean {
  const lastNode = doc.lastChild
  return !!lastNode && NOT_LAST_NODE_TYPES.has(lastNode.type.name)
}

/**
 * Guarantees a trailing empty paragraph whenever the document's last node
 * is one of `NOT_LAST_NODE_TYPES`.
 *
 * Confirmed live: without this, inserting an image block into a fresh,
 * empty document leaves the author with no way back into the editor at
 * all. The document's sole starting paragraph is empty, and ProseMirror's
 * own `insertContentAt` (used by `bridges/imageUpload.ts`'s `Insert` case)
 * consumes that empty paragraph rather than leaving it beside the new
 * block, so the result is a document whose *only* content is one atomic
 * node - schema-valid (`tiptap-extension-document-fixed`'s `content:
 * 'block+'` requires no text block anywhere), but with no text position
 * left anywhere in it. Clicking the block opens its own menu; clicking
 * anywhere else resolves to nothing, since there is nothing left to
 * resolve to - not specific to a failed upload, since a successfully
 * resolved `image` node is exactly as atomic as the placeholder it
 * replaced.
 *
 * This is exactly the bug upstream's own `@tiptap/extension-trailing-node`
 * exists to prevent - written by hand here instead of adding that package,
 * matching this bundle's own preference for small, self-contained
 * ProseMirror plugins over another `@tiptap/*` dependency in a bundle that
 * already has a documented history of version-mismatch surprises (see
 * `AdvancedEditor.tsx`'s own top comment).
 *
 * Two separate hooks, not one - `appendTransaction` alone is not enough.
 * It only ever fires in response to a transaction someone actually
 * dispatches, and a document already stuck in this state (loaded from a
 * draft saved before this fix existed, or from any future bug this doesn't
 * anticipate) can have nothing left for the author to click or type into -
 * exactly the reported symptom, with no transaction ever going to fire to
 * self-correct it. `onCreate` (a genuine editor lifecycle hook, not a raw
 * ProseMirror `view()` reached into for the same effect) covers that: it
 * fixes up whatever document the editor was actually constructed with, once,
 * right after mount. `appendTransaction` then keeps the invariant holding
 * during live editing afterward (select-all-and-delete leaving just an
 * image, undo/redo, etc.).
 */
export const trailingParagraph = Extension.create({
  name: 'trailingParagraph',

  onCreate() {
    this.editor.commands.command(({tr, dispatch}) => {
      if (!needsTrailingParagraph(tr.doc)) return false
      if (dispatch) {
        dispatch(
          tr.insert(
            tr.doc.content.size,
            this.editor.schema.nodes.paragraph.create(),
          ),
        )
      }
      return true
    })
  },

  addProseMirrorPlugins() {
    const paragraphType = this.editor.schema.nodes.paragraph
    return [
      new Plugin({
        key: new PluginKey('trailingParagraph'),
        appendTransaction: (_transactions, _oldState, newState) => {
          if (!needsTrailingParagraph(newState.doc)) return null
          // The newly-inserted paragraph's own type name is 'paragraph',
          // never a member of `NOT_LAST_NODE_TYPES` - this cannot loop.
          return newState.tr.insert(
            newState.doc.content.size,
            paragraphType.create(),
          )
        },
      }),
    ]
  },
})
