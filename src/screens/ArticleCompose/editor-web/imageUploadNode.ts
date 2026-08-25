import {Node} from '@tiptap/core'

import {
  IMAGE_BLOCK_COPY,
  IMAGE_BLOCK_MESSAGES,
  buildImageBlockFrame,
} from './imageBlock'
import {sendToNative} from './sendToNative'

/**
 * The block-level placeholder that stands in for an image before one exists.
 *
 * Placement is the point, and it is a product decision rather than a technical
 * one: an image inserted this way is always its own block, on its own line, at
 * the caret. Authors never deal with text wrapping or float alignment, because
 * those states simply do not exist here.
 *
 * Four states, all wearing the frame from `imageBlock.ts`:
 *
 *   idle         -> "Click to upload". The toolbar inserts this and opens the
 *                   picker in the same action - see below for why a *click* no
 *                   longer does that.
 *   uploading    -> "Uploading…" while the blob is on its way.
 *   too-large    -> the picked image was over the size cap.
 *   upload-failed -> the upload itself failed.
 *
 * On success the bridge swaps this node for a real `image`, which wears the
 * same frame via its own node view - see `imageNodeView.ts` for why the filled
 * state lives there and not here.
 *
 * **Clicking any state here opens the edit menu (Select image / Delete
 * block), not the picker directly - a deliberate change from this node's
 * original design.** The original design opened the picker on click rather
 * than on insert, specifically to avoid a paragraph-split/double-undo defect
 * that insert-and-open had. That defect is real, but a *separate*, never
 * fully root-caused regression later made clicking an inserted block stop
 * opening the picker at all in some sessions - the leading suspect is browser
 * file-input activation timing in `expo-image-picker`'s own web code, but this
 * could never be proven or disproven, because automated Chrome sessions
 * intercept the file chooser and so can never observe a real dialog either
 * succeeding or failing. Rather than keep chasing that, the flow changed
 * instead: the toolbar's Insert action now both places the block and opens
 * the picker itself, in one native action with no WebView round trip in
 * between, so that specific path never depends on a click inside the WebView
 * at all. Every click on a block *after* that - idle, uploading-failed,
 * too-large, or retrying - goes through the menu, the same proven mechanism
 * the filled `image` node already used for Remove/Replace. The menu's own
 * "Select image" reruns the exact same pick-and-upload flow a direct click
 * used to trigger; "Delete block" is a plain deletion with no attempt to
 * rejoin a paragraph the insert may have split - see `bridges/imageUpload.ts`'s
 * `deleteImageUpload` for why that is a deliberate simplification, not an
 * oversight.
 *
 * **Never persisted.** `renderMarkdown` returns an empty string, so a
 * placeholder that happens to exist at save time - the author hits publish, or
 * a draft is saved mid-upload - contributes nothing to the markdown rather than
 * writing a broken image into a published article.
 */
export const imageUploadNode = Node.create({
  name: 'imageUpload',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      uploadId: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute('data-upload-id'),
        renderHTML: (attributes: {uploadId?: string | null}) => {
          if (!attributes.uploadId) return {}
          return {'data-upload-id': attributes.uploadId}
        },
      },
      /**
       * `'idle'` or `'uploading'`. Kept as an attribute rather than module
       * state so concurrent uploads each track their own progress - two blocks
       * can legitimately be in different states at once.
       */
      uploading: {
        default: false,
        parseHTML: (element: HTMLElement) =>
          element.hasAttribute('data-uploading'),
        renderHTML: (attributes: {uploading?: boolean}) => {
          if (!attributes.uploading) return {}
          return {'data-uploading': ''}
        },
      },
      /**
       * `'too-large'`, `'upload-failed'`, or absent. Kept per-node rather than
       * in module state so two blocks can fail independently - one rejected
       * for size while another is mid-upload is a perfectly ordinary sequence.
       */
      errorKind: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute('data-error-kind'),
        renderHTML: (attributes: {errorKind?: string | null}) => {
          if (!attributes.errorKind) return {}
          return {'data-error-kind': attributes.errorKind}
        },
      },
      /** Formatted size, e.g. "7.7 MB". Only meaningful with 'too-large'. */
      errorSize: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute('data-error-size'),
        renderHTML: (attributes: {errorSize?: string | null}) => {
          if (!attributes.errorSize) return {}
          return {'data-error-size': attributes.errorSize}
        },
      },
    }
  },

  parseHTML() {
    return [{tag: 'div[data-image-upload]'}]
  },

  renderHTML() {
    return ['div', {'data-image-upload': ''}]
  },

  /**
   * Plain DOM rather than a React node view. The block has two static states
   * and one click target, so a React renderer would add `@tiptap/react` to
   * this bundle for no behaviour - and this bundle has a documented history of
   * version mismatches around exactly that package (see `dirExtension.ts`).
   */
  addNodeView() {
    return ({
      node,
    }: {
      node: {
        attrs: {
          uploadId?: string | null
          uploading?: boolean
          errorKind?: string | null
          errorSize?: string | null
        }
      }
    }) => {
      const uploading = !!node.attrs.uploading
      const errorKind = node.attrs.errorKind

      /*
       * Per Figma 263:4172 and 263:4205. The two errors differ in their action
       * line: a size rejection tells the author to pick something else, while
       * a failed upload invites the same action again, so it keeps the idle
       * wording. Neither shows the format hint - the error line replaces it.
       */
      // Annotated: `IMAGE_BLOCK_COPY` is `as const`, so without this the
      // initialiser would narrow `action` to that one literal string.
      let action: string = IMAGE_BLOCK_COPY.clickToUpload
      let supporting: string[] = [IMAGE_BLOCK_COPY.formats]
      let error: string[] = []

      if (uploading) {
        action = IMAGE_BLOCK_COPY.uploading
        // The format hint is advice for a choice already made by this point.
        supporting = []
      } else if (errorKind === 'too-large') {
        action = IMAGE_BLOCK_COPY.selectNewImage
        supporting = []
        error = [
          IMAGE_BLOCK_COPY.tooLarge(node.attrs.errorSize ?? ''),
          IMAGE_BLOCK_COPY.tooLargeLimit,
        ]
      } else if (errorKind === 'upload-failed') {
        supporting = []
        error = [IMAGE_BLOCK_COPY.uploadFailed]
      }

      const dom = buildImageBlockFrame({
        icon: 'image-03',
        action,
        supporting,
        error,
      })
      dom.setAttribute('data-image-upload', '')
      if (node.attrs.uploadId) {
        dom.setAttribute('data-upload-id', node.attrs.uploadId)
      }
      if (uploading) dom.setAttribute('data-uploading', '')
      if (errorKind) dom.setAttribute('data-error-kind', errorKind)

      // Errors remain clickable: retrying is offered from the same menu below.
      if (!uploading) {
        dom.style.cursor = 'pointer'
        dom.addEventListener('click', () => {
          const rect = dom.getBoundingClientRect()
          sendToNative({
            type: IMAGE_BLOCK_MESSAGES.requestMenu,
            payload: {
              kind: 'placeholder',
              uploadId: node.attrs.uploadId,
              rect: {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
              },
            },
          })
        })
      }

      return {dom}
    }
  },
})

/**
 * Markdown serialization for the placeholder: deliberately nothing. Wired into
 * the shared `MarkdownManager` in `manager.ts` so the save path knows this node
 * type exists and emits nothing for it, rather than meeting an unregistered
 * node mid-serialize.
 */
export const imageUploadMarkdown = {
  renderMarkdown: () => '',
}
