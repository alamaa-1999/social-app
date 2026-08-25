import {EditorContent} from '@tiptap/react'
import {
  ImageBridge as DefaultImageBridge,
  LinkBridge as DefaultLinkBridge,
  TenTapStartKit,
  UnderlineBridge as DefaultUnderlineBridge,
  useTenTap,
} from '@10play/tentap-editor'

import {
  ContentBridge,
  createContentBridgeMessageHandler,
} from '../bridges/content'
import {HonorificBridge} from '../bridges/honorific'
import {ImageUploadBridge} from '../bridges/imageUpload'
import {LinkBridge} from '../bridges/link'
import {ParagraphStyleBridge} from '../bridges/paragraphStyle'
import {TextAlignBridge} from '../bridges/textAlign'
import {TypographyBridge} from '../bridges/typography'
import {UnderlineBridge} from '../bridges/underline'
import {type EditorFacet} from '../state'
import {dirExtension} from './dirExtension'
import {imageNode} from './imageNodeView'
import {manager} from './manager'
import {
  applyFacetsToParsedDoc,
  serializeToMarkdownAndFacets,
} from './serializer'

/**
 * `TenTapStartKit` minus three of its own bridges.
 *
 * `UnderlineBridge` - see `bridges/underline.ts` for why the default's
 * `++text++` markdown rendering conflicts with this app's design, and why a
 * filtered replacement rather than `.extendExtension()` is the correct fix.
 * `LinkBridge` - see `bridges/link.ts`.
 *
 * `ImageBridge` is filtered for a harder reason: **as shipped, it makes any
 * image node crash the editor.** Its web-bundled extension declares
 *
 *     addNodeView() {
 *       if (!this.options.resize?.enabled || typeof document > 'u') return null
 *       ...
 *     }
 *
 * and the bridge configures it as `.configure({allowBase64: true})` - with no
 * `resize`, so `addNodeView()` returns `null`. The TipTap version inlined in
 * that same bundle calls the result of `addNodeView()` unconditionally, so
 * ProseMirror ends up invoking `null(...)` the moment it builds a view for an
 * image, throwing `TypeError: o(...) is not a function` from inside
 * `NodeViewDesc.create`. The transaction never commits, so an insert appears
 * to hang forever.
 *
 * Confirmed live in the editor: a bare
 * `insertContentAt({type: 'image', attrs: {src}})` reproduces it with no
 * upload, no bridge and no async involved. It is a pre-existing defect in this
 * package/TipTap combination, not something this app introduced - and it is
 * the real cause of the long-standing "insert an image and nothing ever
 * appears" symptom, which had previously been misattributed to the blob URL
 * 404ing.
 *
 * `imageNode` (registered via `tiptapOptions.extensions` below) replaces it:
 * same underlying `@tiptap/extension-image`, but with a plain-DOM node view
 * that actually returns one. Nothing depended on the bridge's own `setImage`
 * command - grepped before removing.
 */
const startKitWithoutDefaultUnderline = TenTapStartKit.filter(
  bridge =>
    bridge !== DefaultUnderlineBridge &&
    bridge !== DefaultLinkBridge &&
    bridge !== DefaultImageBridge,
)

/**
 * `ContentBridge` deliberately ships with no `onBridgeMessage` of its own
 * (see `bridges/content.ts`'s own top comment) - this is the one, genuinely
 * web-only place that attaches it, closing over the real `manager` this
 * module already needs for initial-content loading below. Assigned once,
 * at module scope, not inside the component body - the handler doesn't
 * depend on any React state/props, so re-assigning it every render would
 * be pure waste.
 */
ContentBridge.onBridgeMessage = createContentBridgeMessageHandler({
  serialize: doc => serializeToMarkdownAndFacets(manager, doc as never),
  parse: (markdown, facets) =>
    applyFacetsToParsedDoc(manager, markdown, facets as never),
})

/**
 * Native injects `window.initialContent` before this bundle's own scripts
 * run (`injectedJavaScriptBeforeContentLoaded` - confirmed directly from
 * `@10play/tentap-editor`'s own `RichText/utils.ts`), as a plain
 * `{markdown, facets}` object - `useEditorBridge`'s native `initialContent`
 * option accepts `string | object`, and native passes the object form
 * directly rather than double-JSON-encoding it into a string this file
 * would just have to `JSON.parse` back out. Read and correlated once, at
 * module scope, not per-render or via `useTenTap`'s own default `content:
 * window.initialContent` handling (see below) - that default only ever
 * treats it as literal HTML/JSON to hand `useEditor` unmodified, with no
 * sanitization pass and no facet correlation against markdown byte
 * offsets, which is the entire reason `applyFacetsToParsedDoc` exists.
 */
const initialContentFromNative = (
  window as unknown as {
    initialContent?: {markdown: string; facets: EditorFacet[]}
  }
).initialContent ?? {markdown: '', facets: []}
const {doc: initialDoc} = applyFacetsToParsedDoc(
  manager,
  initialContentFromNative.markdown,
  initialContentFromNative.facets,
)

/**
 * Web side of ArticleCompose's body editor, bundled separately by Vite into
 * a single-file HTML string TenTap's native `useEditorBridge` loads as
 * `customSource`.
 *
 * `disableColorHighlight: true` - TenTap's bundled `blueBackgroundPlugin` (a
 * Decoration-based selection highlight) breaks copy/cut on multi-word
 * selections (confirmed via live device testing this session: disabling it
 * fixes copy/cut completely). Kept permanently disabled rather than as a
 * diagnostic - the OS/browser's own native text-selection highlight already
 * renders fine on both Android and web without it.
 */
export function AdvancedEditor() {
  ;(
    window as unknown as {disableColorHighlight?: boolean}
  ).disableColorHighlight = true
  const editor = useTenTap({
    // `content` here overrides `useTenTap`'s own internal `content:
    // window.initialContent` line - confirmed directly from its source:
    // `tiptapOptionsWithExtensions` (built from this `tiptapOptions`) is
    // spread *last* into the object handed to `useEditor`, so this key
    // always wins.
    //
    // `dirExtension` registers the `dir` global attribute this app's own
    // RTL styling depends on. TipTap core's own `TextDirection` extension
    // would normally do this (given a `textDirection` option), but never
    // reaches the running editor at all here - see `dirExtension.ts`'s doc
    // comment for the full account, confirmed live via
    // `editor.extensionManager.extensions` on a real device.
    tiptapOptions: {
      content: initialDoc as never,
      // `imageNode` replaces the filtered-out `ImageBridge` (see above): same
      // `@tiptap/extension-image`, but with a node view that actually returns
      // one, plus the designed frame. Registered here rather than as a bridge
      // because it needs no native command surface of its own - the image
      // lifecycle is driven entirely through `ImageUploadBridge`.
      extensions: [dirExtension, imageNode],
    },
    bridges: [
      ...startKitWithoutDefaultUnderline,
      UnderlineBridge,
      LinkBridge,
      TextAlignBridge,
      TypographyBridge,
      HonorificBridge,
      ImageUploadBridge,
      ParagraphStyleBridge,
      ContentBridge,
    ],
  })

  return <EditorContent editor={editor} />
}
