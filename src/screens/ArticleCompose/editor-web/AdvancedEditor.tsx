import {EditorContent} from '@tiptap/react'
import {
  TenTapStartKit,
  UnderlineBridge as DefaultUnderlineBridge,
  useTenTap,
} from '@10play/tentap-editor'

import {
  ContentBridge,
  createContentBridgeMessageHandler,
} from '../bridges/content'
import {HonorificBridge} from '../bridges/honorific'
import {ParagraphStyleBridge} from '../bridges/paragraphStyle'
import {TextAlignBridge} from '../bridges/textAlign'
import {TypographyBridge} from '../bridges/typography'
import {UnderlineBridge} from '../bridges/underline'
import {type EditorFacet} from '../state'
import {manager} from './manager'
import {
  applyFacetsToParsedDoc,
  serializeToMarkdownAndFacets,
} from './serializer'

/**
 * `TenTapStartKit` minus its own default `UnderlineBridge` - see
 * `bridges/underline.ts`'s doc comment for why the default's `++text++`
 * markdown rendering conflicts with this app's design and why a filtered
 * replacement, not `.extendExtension()`, is the correct fix.
 */
const startKitWithoutDefaultUnderline = TenTapStartKit.filter(
  bridge => bridge !== DefaultUnderlineBridge,
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
    tiptapOptions: {content: initialDoc as never},
    bridges: [
      ...startKitWithoutDefaultUnderline,
      UnderlineBridge,
      TextAlignBridge,
      TypographyBridge,
      HonorificBridge,
      ParagraphStyleBridge,
      ContentBridge,
    ],
  })

  return <EditorContent editor={editor} />
}
