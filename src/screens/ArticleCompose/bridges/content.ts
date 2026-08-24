import {BridgeExtension} from '@10play/tentap-editor'

import {type EditorFacet} from '../state'

/**
 * The one bridge that actually knows about this app's markdown+facets wire
 * format - everything else here (TenTap's own bridges, `ParagraphStyleBridge`)
 * only ever manipulates the live ProseMirror document. Native only ever
 * sees the plain `{markdown, facets}` pair this bridge produces or
 * consumes.
 *
 * Deliberately does NOT import `MarkdownManager`/`serializeToMarkdownAndFacets`/
 * `applyFacetsToParsedDoc` at this file's top level, even though the actual
 * logic (`createContentBridgeMessageHandler` below) needs them - this file
 * is imported by *both* `AdvancedEditor.tsx` (web, Vite) and `index.tsx`
 * (native, Metro), same as every other bridge here, but those functions
 * live under `editor-web/`, which pulls in `@tiptap/markdown`/`@tiptap/core`
 * (the isolated web bundle's own dependencies - see `state.ts`'s
 * `validateFacetBounds` doc comment for the identical reasoning applied
 * there first). Importing them here would drag that whole module graph
 * into the native Metro bundle for a code path (`onBridgeMessage`) that
 * TenTap's own `useTenTap.tsx` only ever *calls* on the web side in the
 * first place - confirmed directly by reading its source, not assumed:
 * native's `useEditorBridge.tsx` only ever invokes `extendEditorInstance`
 * on a bridge, never `onBridgeMessage`. So the manager-dependent handler is
 * built via `createContentBridgeMessageHandler` (dependency-injected, no
 * import of its own) and attached with `ContentBridge.onBridgeMessage =
 * createContentBridgeMessageHandler({...})` only from `AdvancedEditor.tsx`,
 * the one file that's genuinely web-only and already needs the same
 * manager for its own initial-content loading.
 *
 * Native-callable `getMarkdownAndFacets()` is request/response, not a
 * plain fire-and-forget bridge message - `sendBridgeMessage` only ever
 * posts *into* the WebView, so getting a value *back* needs a matching
 * message travelling the other way that this bridge's own
 * `onEditorMessage` picks up and resolves against. TenTap's own
 * `CoreBridge` (`getHTML`/`getJSON`/`getText`) does exactly this via an
 * internal `asyncMessages` singleton - not reused directly here since it's
 * not part of the package's public API (confirmed via `grep` against
 * `@10play/tentap-editor`'s own `src/index.tsx`: no `AsyncMessages` export
 * anywhere), so this is a small, local equivalent of the same
 * messageId-keyed-listener pattern, not a novel design.
 */

class PendingRequests {
  private listeners: Record<string, (value: unknown) => void> = {}

  resolve(messageId: string, value: unknown) {
    this.listeners[messageId]?.(value)
    delete this.listeners[messageId]
  }

  wait<T>(messageId: string): Promise<T> {
    return new Promise(resolve => {
      this.listeners[messageId] = resolve as (value: unknown) => void
    })
  }
}

const pendingRequests = new PendingRequests()

type MarkdownAndFacets = {markdown: string; facets: EditorFacet[]}

type ContentEditorState = {
  wordCount: number
  charCount: number
}

type ContentEditorInstance = {
  getMarkdownAndFacets: () => Promise<MarkdownAndFacets>
  loadMarkdownAndFacets: (markdown: string, facets: EditorFacet[]) => void
}

declare module '@10play/tentap-editor' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface BridgeState extends ContentEditorState {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface EditorBridge extends ContentEditorInstance {}
}

export enum ContentActionType {
  GetMarkdownAndFacets = 'get-markdown-and-facets',
  SendMarkdownAndFacetsToNative = 'send-markdown-and-facets-to-native',
  LoadMarkdownAndFacets = 'load-markdown-and-facets',
}

export type ContentMessage =
  | {
      type: ContentActionType.GetMarkdownAndFacets
      payload: {messageId: string}
    }
  | {
      type: ContentActionType.SendMarkdownAndFacetsToNative
      payload: MarkdownAndFacets & {messageId: string}
    }
  | {
      type: ContentActionType.LoadMarkdownAndFacets
      payload: MarkdownAndFacets
    }

/**
 * The actual web-side `onBridgeMessage` logic, factored out as a plain
 * function taking `serialize`/`parse` as arguments instead of importing
 * them - see this file's own top comment for why. `editor` is typed
 * structurally, just the two real methods this handler calls, rather than
 * importing TipTap's own `Editor` type for a two-method surface.
 */
export function createContentBridgeMessageHandler(deps: {
  serialize: (doc: object) => {markdown: string; facets: EditorFacet[]}
  parse: (markdown: string, facets: EditorFacet[]) => {doc: object}
}) {
  return (
    editor: {
      getJSON: () => object
      commands: {setContent: (content: unknown) => void}
    },
    message: ContentMessage,
    sendMessageBack: (message: ContentMessage) => void,
  ): boolean => {
    switch (message.type) {
      case ContentActionType.GetMarkdownAndFacets: {
        const result = deps.serialize(editor.getJSON())
        sendMessageBack({
          type: ContentActionType.SendMarkdownAndFacetsToNative,
          payload: {
            markdown: result.markdown,
            facets: result.facets,
            messageId: message.payload.messageId,
          },
        })
        return false
      }
      case ContentActionType.LoadMarkdownAndFacets: {
        const {doc} = deps.parse(
          message.payload.markdown,
          message.payload.facets,
        )
        editor.commands.setContent(doc)
        return true
      }
      default:
        return false
    }
  }
}

export const ContentBridge = new BridgeExtension<
  ContentEditorState,
  ContentEditorInstance,
  ContentMessage
>({
  forceName: 'content',
  onEditorMessage: ({type, payload}) => {
    if (type === ContentActionType.SendMarkdownAndFacetsToNative) {
      pendingRequests.resolve(payload.messageId, {
        markdown: payload.markdown,
        facets: payload.facets,
      })
      return true
    }
    return false
  },
  extendEditorInstance: sendBridgeMessage => {
    return {
      getMarkdownAndFacets: () => {
        const messageId = Math.random().toString(36).slice(2)
        const result = pendingRequests.wait<MarkdownAndFacets>(messageId)
        sendBridgeMessage({
          type: ContentActionType.GetMarkdownAndFacets,
          payload: {messageId},
        })
        return result
      },
      loadMarkdownAndFacets: (markdown, facets) =>
        sendBridgeMessage({
          type: ContentActionType.LoadMarkdownAndFacets,
          payload: {markdown, facets},
        }),
    }
  },
  extendEditorState: editor => {
    const text = editor.getText()
    return {
      wordCount: text.trim() ? text.trim().split(/\s+/).length : 0,
      charCount: new TextEncoder().encode(text).byteLength,
    }
  },
})
