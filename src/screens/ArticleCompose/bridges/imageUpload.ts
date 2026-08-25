import {BridgeExtension} from '@10play/tentap-editor'

import {IMAGE_BLOCK_MESSAGES} from '../editor-web/imageBlock'
import {setImageFileNames} from '../editor-web/imageNodeView'
import {imageUploadNode} from '../editor-web/imageUploadNode'

/**
 * Drives the body-image block: the transient `imageUpload` placeholder, and the
 * `image` node it becomes.
 *
 * Native owns the file the whole way. The picker and the authenticated
 * `uploadBlob` both run there, and only small JSON messages cross the bridge.
 * That is deliberate: the transport is `postMessage(JSON.stringify(...))` -
 * strings only, no binary - so sending the file itself would mean base64,
 * turning a 3 MiB image into a ~4 MiB string on the JS thread. Uploading from
 * inside the WebView instead would need the session token in there, and the
 * editor is served as inline HTML so its origin is null, which CORS would
 * reject anyway. Keeping the file native avoids both.
 *
 * ## Flow
 *
 * The toolbar both inserts the block and opens the picker, in one native
 * action - not a click inside the WebView. That is a deliberate change from
 * an earlier design where the block started idle and a click opened the
 * picker: clicking an inserted block stopped reliably opening the picker in
 * some sessions, a regression never conclusively root-caused (the leading
 * suspect is browser file-input activation timing in `expo-image-picker`'s
 * own web code, but automated Chrome sessions intercept the file chooser and
 * so can never confirm or deny it). Rather than keep chasing that, the
 * insert path was changed to never depend on a WebView click at all.
 *
 * Every click *inside* the WebView - on an idle block, a failed upload, an
 * oversized-image error, or an existing image - now asks native for the edit
 * menu instead of a picker directly. The menu offers "Select image"/"Delete
 * block" for a placeholder or "Remove"/"Replace" for an image, and "Select
 * image" is what actually reruns the pick-and-upload flow a direct click used
 * to trigger. This is also why there is no cancel message here: the older
 * insert-and-open-immediately design needed one, because dismissing the
 * picker had to un-insert the block, and removing a block that had split a
 * paragraph left the halves separated and took two undo presses to unwind.
 * "Delete block" sidesteps that by never attempting to rejoin anything - see
 * `deleteImageUpload` below.
 *
 * ## Why messages travel in both directions
 *
 * Commands go native -> web through `extendEditorInstance`. The click that
 * requests the menu goes web -> native, because the elements live in the
 * WebView while the ALF menu lives in React Native. `onEditorMessage`
 * receives it, but it is a module-level function with no access to component
 * state, so it dispatches through the small registry below - the same shape
 * `content.ts` uses for its `pendingRequests`.
 */

type ImageBlockRect = {x: number; y: number; width: number; height: number}

/**
 * What was clicked inside the WebView, discriminated by `kind` so one menu
 * mechanism can serve both node types. A placeholder click carries its
 * `uploadId` (never a `src` - it has no image yet); an image click carries
 * the `src`/`cid` the existing Remove/Replace actions already need.
 *
 * Exported so `index.tsx` can type `imageMenuTarget` against this exact shape
 * rather than hand-maintaining a second copy of the union that could drift.
 */
export type MenuRequest =
  | {kind: 'image'; src: string; cid?: string; rect: ImageBlockRect}
  | {kind: 'placeholder'; uploadId: string | null; rect: ImageBlockRect}

type Listeners = {
  menu?: (request: MenuRequest) => void
}

const listeners: Listeners = {}

/**
 * Registers the screen's handler for clicks that happened inside the WebView.
 *
 * Returns a disposer. Deliberately single-subscriber rather than a list: two
 * composers are never mounted at once, and a silently-accumulating listener
 * list would mean a remounted screen opening two menus for one click.
 */
export function subscribeToImageBlockEvents(next: Listeners): () => void {
  listeners.menu = next.menu
  return () => {
    listeners.menu = undefined
  }
}

type ImageUploadEditorInstance = {
  /** Places an idle placeholder at the caret, on its own line. */
  insertImageUpload: (uploadId: string) => void
  /** Switches a placeholder between its idle and uploading states. */
  setImageUploading: (uploadId: string, uploading: boolean) => void
  /**
   * Puts a placeholder into one of its error states, or clears it with
   * `null`. The message lives in the editor bundle rather than being passed
   * as text, so all block copy stays in one file.
   */
  setImageError: (
    uploadId: string,
    kind: 'too-large' | 'upload-failed' | null,
    size?: string,
  ) => void
  /** Swaps a placeholder for a real image node, in one transaction. */
  resolveImageUpload: (uploadId: string, url: string) => void
  /**
   * Removes a placeholder outright - the menu's "Delete block" action.
   *
   * Deliberately a plain deletion, nothing more. Inserting a block at the
   * caret can split the paragraph it lands in, and this makes no attempt to
   * rejoin the halves afterward - the project owner's own call, made
   * explicitly to keep this simple: the author can join a stray paragraph
   * back with an ordinary Backspace, the same as any other paragraph break
   * they didn't want.
   */
  deleteImageUpload: (uploadId: string) => void
  /** Removes the image whose `src` matches. */
  removeImageBySrc: (src: string) => void
  /** Points an existing image at a different blob. */
  replaceImageSrc: (src: string, nextSrc: string) => void
  /** Publishes filenames, keyed by blob CID, for the explanatory state. */
  setImageFileNames: (names: Record<string, string>) => void
}

declare module '@10play/tentap-editor' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface EditorBridge extends ImageUploadEditorInstance {}
}

enum ImageUploadActionType {
  Insert = 'image-upload-insert',
  SetUploading = 'image-upload-set-uploading',
  SetError = 'image-upload-set-error',
  Resolve = 'image-upload-resolve',
  DeleteImageUpload = 'image-upload-delete',
  RemoveBySrc = 'image-remove-by-src',
  ReplaceSrc = 'image-replace-src',
  SetFileNames = 'image-set-file-names',
}

type ImageUploadMessage =
  | {type: ImageUploadActionType.Insert; payload: {uploadId: string}}
  | {
      type: ImageUploadActionType.SetUploading
      payload: {uploadId: string; uploading: boolean}
    }
  | {
      type: ImageUploadActionType.SetError
      payload: {uploadId: string; kind: string | null; size?: string}
    }
  | {
      type: ImageUploadActionType.Resolve
      payload: {uploadId: string; url: string}
    }
  | {type: ImageUploadActionType.DeleteImageUpload; payload: {uploadId: string}}
  | {type: ImageUploadActionType.RemoveBySrc; payload: {src: string}}
  | {
      type: ImageUploadActionType.ReplaceSrc
      payload: {src: string; nextSrc: string}
    }
  | {
      type: ImageUploadActionType.SetFileNames
      payload: {names: Record<string, string>}
    }

/** ProseMirror's own shape, narrowed to what this file actually touches. */
type DocNode = {
  descendants: (
    fn: (
      node: {
        type: {name: string}
        attrs: {uploadId?: string; src?: string}
        nodeSize: number
      },
      pos: number,
    ) => void,
  ) => void
}

type Range = {from: number; to: number}

/**
 * Locates a node by predicate. Returns `undefined` rather than guessing when
 * there is no match - a perfectly ordinary outcome, since the author can delete
 * a block while an upload is still in flight. Callers treat that as "nothing to
 * do".
 */
function findNode(
  doc: DocNode,
  match: (node: {
    type: {name: string}
    attrs: {uploadId?: string; src?: string}
  }) => boolean,
): Range | undefined {
  let found: Range | undefined
  doc.descendants((node, pos) => {
    if (found) return
    if (match(node)) found = {from: pos, to: pos + node.nodeSize}
  })
  return found
}

export const ImageUploadBridge = new BridgeExtension<
  unknown,
  ImageUploadEditorInstance,
  ImageUploadMessage
>({
  tiptapExtension: imageUploadNode as never,

  onEditorMessage: message => {
    /*
     * Read as the plain wire shape rather than the declared union. This name
     * is not a member of `ImageUploadActionType` - it is defined in
     * `imageBlock.ts` so the WebView node views can send it without importing
     * this module, which would be circular. Comparing the enum type against
     * it directly is a type error, and casting at the comparison would be the
     * same fix written less honestly. Matches how `bridges/link.ts` handles
     * upstream's un-exported action enum.
     */
    const {type, payload} = message as unknown as {
      type: string
      payload: unknown
    }
    if (type === IMAGE_BLOCK_MESSAGES.requestMenu) {
      listeners.menu?.(payload as MenuRequest)
      return true
    }
    return false
  },

  onBridgeMessage: (editor, message) => {
    /*
     * Typed as the enum, unlike `onEditorMessage` above. Every case here is a
     * genuine `ImageUploadActionType` member - only the two web-originated
     * names live outside it - so narrowing to `string` would be less accurate
     * and would leave the switch comparing across types.
     */
    const {type, payload} = message as unknown as {
      type: ImageUploadActionType
      payload: {
        uploadId?: string
        url?: string
        src?: string
        nextSrc?: string
        uploading?: boolean
        kind?: string | null
        size?: string
        names?: Record<string, string>
      }
    }

    /*
     * TipTap's own commands throughout, deliberately. An earlier version
     * hand-built ProseMirror transactions and the resolve step silently did
     * nothing on the real editor: the upload completed, the message arrived,
     * and the placeholder just sat there. Commands go through the same command
     * manager every other bridge here already uses successfully, rather than
     * reaching past it into internals whose shape this bundle's TipTap version
     * mismatch makes unsafe to assume.
     */
    const ed = editor as unknown as {
      commands: {
        insertContentAt: (range: number | Range, content: unknown) => boolean
        deleteRange: (range: Range) => boolean
        updateAttributes: (
          type: string,
          attrs: Record<string, unknown>,
        ) => boolean
        setNodeSelection: (pos: number) => boolean
        focus: () => boolean
      }
      state: {doc: DocNode; selection: {from: number}}
    }

    /*
     * Everything below runs inside the WebView, on the far side of a
     * `postMessage`. An exception here does NOT reach the `try/catch` around
     * the upload in `index.tsx` - that awaits the network call, not the
     * editor's reaction to the result. Without this wrapper an editor-side
     * failure is completely invisible: the transaction never commits, the
     * block sits on "Uploading…" forever, and nothing appears on screen.
     *
     * That is not hypothetical. It is exactly how the `ImageBridge` node-view
     * crash (see `AdvancedEditor.tsx`) presented - silent to the author, only
     * visible in the console. Logging loudly here is what turns the next one
     * into something reportable rather than a mystery hang.
     */
    try {
      applyImageUploadMessage(ed, type, payload)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        `[ArticleCompose] image bridge failed while handling "${type}"`,
        err,
      )
    }
    return false
  },

  extendEditorInstance: sendBridgeMessage => {
    return {
      insertImageUpload: uploadId =>
        sendBridgeMessage({
          type: ImageUploadActionType.Insert,
          payload: {uploadId},
        }),
      setImageUploading: (uploadId, uploading) =>
        sendBridgeMessage({
          type: ImageUploadActionType.SetUploading,
          payload: {uploadId, uploading},
        }),
      setImageError: (uploadId, kind, size) =>
        sendBridgeMessage({
          type: ImageUploadActionType.SetError,
          payload: {uploadId, kind, size},
        }),
      resolveImageUpload: (uploadId, url) =>
        sendBridgeMessage({
          type: ImageUploadActionType.Resolve,
          payload: {uploadId, url},
        }),
      deleteImageUpload: uploadId =>
        sendBridgeMessage({
          type: ImageUploadActionType.DeleteImageUpload,
          payload: {uploadId},
        }),
      removeImageBySrc: src =>
        sendBridgeMessage({
          type: ImageUploadActionType.RemoveBySrc,
          payload: {src},
        }),
      replaceImageSrc: (src, nextSrc) =>
        sendBridgeMessage({
          type: ImageUploadActionType.ReplaceSrc,
          payload: {src, nextSrc},
        }),
      setImageFileNames: names =>
        sendBridgeMessage({
          type: ImageUploadActionType.SetFileNames,
          payload: {names},
        }),
    }
  },
})

/** The editor-side effect of one bridge message. Throwing is caught above. */
function applyImageUploadMessage(
  ed: {
    commands: {
      insertContentAt: (range: number | Range, content: unknown) => boolean
      deleteRange: (range: Range) => boolean
      updateAttributes: (
        type: string,
        attrs: Record<string, unknown>,
      ) => boolean
      setNodeSelection: (pos: number) => boolean
      focus: () => boolean
    }
    state: {doc: DocNode; selection: {from: number}}
  },
  type: ImageUploadActionType,
  payload: {
    uploadId?: string
    url?: string
    src?: string
    nextSrc?: string
    uploading?: boolean
    kind?: string | null
    size?: string
    names?: Record<string, string>
  },
): void {
  {
    switch (type) {
      case ImageUploadActionType.Insert: {
        ed.commands.insertContentAt(ed.state.selection.from, {
          type: 'imageUpload',
          attrs: {uploadId: payload.uploadId},
        })
        break
      }
      case ImageUploadActionType.SetUploading: {
        const found = findNode(
          ed.state.doc,
          n =>
            n.type.name === 'imageUpload' &&
            n.attrs.uploadId === payload.uploadId,
        )
        if (!found) break
        // Select the node first so `updateAttributes` targets this placeholder
        // rather than whichever one the caret happens to sit in.
        ed.commands.setNodeSelection(found.from)
        ed.commands.updateAttributes('imageUpload', {
          uploading: !!payload.uploading,
        })
        break
      }
      case ImageUploadActionType.SetError: {
        const found = findNode(
          ed.state.doc,
          n =>
            n.type.name === 'imageUpload' &&
            n.attrs.uploadId === payload.uploadId,
        )
        if (!found) break
        // Select first, so the update lands on this block rather than
        // whichever one the caret happens to sit in.
        ed.commands.setNodeSelection(found.from)
        ed.commands.updateAttributes('imageUpload', {
          errorKind: payload.kind ?? null,
          errorSize: payload.size ?? null,
          // An error always ends the uploading state; leaving both set would
          // render a spinner and a failure at once.
          uploading: false,
        })
        break
      }
      case ImageUploadActionType.Resolve: {
        const found = findNode(
          ed.state.doc,
          n =>
            n.type.name === 'imageUpload' &&
            n.attrs.uploadId === payload.uploadId,
        )
        if (!found || !payload.url) break
        // Replacing the placeholder's exact range in one command keeps this a
        // single undo step and never leaves a frame with neither the
        // placeholder nor the image.
        ed.commands.insertContentAt(found, {
          type: 'image',
          attrs: {src: payload.url},
        })
        break
      }
      case ImageUploadActionType.DeleteImageUpload: {
        const found = findNode(
          ed.state.doc,
          n =>
            n.type.name === 'imageUpload' &&
            n.attrs.uploadId === payload.uploadId,
        )
        if (!found) break
        /*
         * Plain deletion, deliberately. Inserting this block at the caret can
         * split whatever paragraph it landed in, and this makes no attempt to
         * rejoin the halves - see `ImageUploadEditorInstance.deleteImageUpload`
         * above for why that is a deliberate simplification rather than a gap.
         */
        ed.commands.deleteRange(found)
        break
      }
      case ImageUploadActionType.RemoveBySrc: {
        const found = findNode(
          ed.state.doc,
          n => n.type.name === 'image' && n.attrs.src === payload.src,
        )
        if (!found) break
        ed.commands.deleteRange(found)
        break
      }
      case ImageUploadActionType.ReplaceSrc: {
        const found = findNode(
          ed.state.doc,
          n => n.type.name === 'image' && n.attrs.src === payload.src,
        )
        if (!found || !payload.nextSrc) break
        ed.commands.insertContentAt(found, {
          type: 'image',
          attrs: {src: payload.nextSrc},
        })
        break
      }
      case ImageUploadActionType.SetFileNames: {
        /*
         * `setImageFileNames` pushes straight into the blocks already on
         * screen - see its own note for why. An earlier version dispatched an
         * empty transaction here hoping to force a re-render; that does
         * nothing, because ProseMirror reuses node views whose node has not
         * changed, and it was why the filename never appeared.
         */
        setImageFileNames(payload.names ?? {})
        break
      }
    }
  }
}
