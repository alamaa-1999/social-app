import {useEffect} from 'react'
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
import {TitleSubtitleBridge} from '../bridges/titleSubtitle'
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
import {trailingParagraph} from './trailingParagraph'

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
    initialContent?: {
      markdown: string
      facets: EditorFacet[]
      colors?: {
        bg: string
        text: string
        textMuted: string
        textSecondary: string
        textStrong: string
        border: string
        error: string
        accent: string
      }
    }
  }
).initialContent ?? {markdown: '', facets: []}
const {doc: initialDoc} = applyFacetsToParsedDoc(
  manager,
  initialContentFromNative.markdown,
  initialContentFromNative.facets,
)

/**
 * `index.html`'s own `<style>` block reads these as `var(--editor-*)`, with
 * light-mode literals as the fallback default - see that file's own comment
 * on its `:root` block for why a fallback is needed at all (this bundle is
 * also loaded standalone by `TipTapSpike.tsx`, which passes no `colors`).
 * Native already resolved these once via `useTheme()` - genuinely resolved
 * values, not a theme name, since this bundle has no access to `@bsky.app/alf`
 * to resolve one itself (the same reason this file's own fonts are
 * self-instanced rather than shared - see `index.html`'s font comment).
 * Applied once, at this same module-scope point, matching every other
 * `window.initialContent` field's own timing.
 */
const colorsFromNative = initialContentFromNative.colors
if (colorsFromNative) {
  const root = document.documentElement.style
  root.setProperty('--editor-bg', colorsFromNative.bg)
  root.setProperty('--editor-text', colorsFromNative.text)
  root.setProperty('--editor-text-muted', colorsFromNative.textMuted)
  root.setProperty('--editor-text-secondary', colorsFromNative.textSecondary)
  root.setProperty('--editor-text-strong', colorsFromNative.textStrong)
  root.setProperty('--editor-border', colorsFromNative.border)
  root.setProperty('--editor-error', colorsFromNative.error)
  root.setProperty('--editor-accent', colorsFromNative.accent)
}

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
      // lifecycle is driven entirely through `ImageUploadBridge`. `trailingParagraph`
      // is the same kind of registration for the same reason: no command
      // surface of its own, just a standing invariant on the live document.
      extensions: [dirExtension, imageNode, trailingParagraph],
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
      TitleSubtitleBridge,
    ],
  })

  /*
   * Fixes a reported bug: opening the editor unfocused, the first click on
   * the body area both scrolled the page and failed to show a caret,
   * requiring a second click to actually focus. Root-caused as two
   * independent issues stacked on top of each other, confirmed live one at
   * a time rather than assumed:
   *
   * 1. Caret placement itself: already correct with no help from this app.
   * A plain, unaided click already both focuses `.ProseMirror` and places
   * the caret at the clicked position correctly - `index.tsx`'s own doc
   * comment (search "Attempt 5") has the full account of how confirming
   * this closed out a much larger parent-side `.focus(...)` mechanism that
   * turned out to be racing the native click rather than fixing a real gap
   * in it.
   *
   * 2. The scroll jump: genuine browser-native default-action focus-scroll,
   * not anything ProseMirror or this app's own code was doing. Ruled out
   * first, directly against `prosemirror-view`'s own source: every
   * transaction-triggered scroll goes through `EditorView.updateStateInner`
   * calling `this.scrollToSelection()`, which checks a
   * `handleScrollToSelection` editorProp before either of its own fallback
   * paths - wiring in `() => true` there suppresses every possible
   * PM-triggered scroll unconditionally, and the jump still happened live,
   * ruling out ProseMirror's own transaction/scroll system entirely. That
   * leaves the browser's own native default action for focusing a
   * not-yet-focused element: per the HTML Standard's focusing steps, a
   * scroll-to-reveal step runs as part of focusing an element, and the
   * `{preventScroll: true}` flag that suppresses it is only available to a
   * *script-initiated* `.focus()` call - when the browser itself focuses an
   * element as the default action of a raw click, there's no way to attach
   * that flag after the fact. Matches every observed detail: only the
   * *first* click while unfocused jumps (a later click has nothing left to
   * focus), the jump is synchronous with `mousedown` rather than a delayed
   * reaction, and it survived every PM-level scroll path already being
   * suppressed.
   *
   * Fix: preemptively call `.focus({preventScroll: true})` on the editor's
   * own DOM node ourselves, synchronously, in a capturing-phase `mousedown`
   * handler - which runs *before* the browser processes its own default
   * action for that same event. By the time the browser would otherwise
   * focus the element natively (unprotected), it's already focused, so that
   * default step becomes a no-op. Native caret placement is untouched,
   * since this never calls `preventDefault()` on the event - only
   * ProseMirror's own already-confirmed-correct click handling (point 1
   * above) still runs. Confirmed live: the jump is gone and the caret still
   * lands exactly where clicked.
   */
  useEffect(() => {
    if (!editor) return
    const onMouseDown = () => {
      const dom = editor.view.dom
      if (document.activeElement !== dom) {
        dom.focus({preventScroll: true})
      }
    }
    document.addEventListener('mousedown', onMouseDown, true)
    return () => document.removeEventListener('mousedown', onMouseDown, true)
  }, [editor])

  return <EditorContent editor={editor} />
}
