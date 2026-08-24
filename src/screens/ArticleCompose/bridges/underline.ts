import {UnderlineBridge as DefaultUnderlineBridge} from '@10play/tentap-editor'
import Underline from '@tiptap/extension-underline'

/**
 * Replaces `TenTapStartKit`'s own `UnderlineBridge` (kept out of the
 * `bridges` list in `editor-web/AdvancedEditor.tsx` for this exact reason).
 * `@tiptap/extension-underline`'s default `renderMarkdown` emits `++text++`
 * - a real, non-standard Pandoc-style extension, not CommonMark/GFM -
 * which conflicts directly with this app's lexicon decision that underline
 * stays a facet-only concept with no native markdown syntax of its own
 * (`com.sunnahsky.richtext.facets.formatting#underline`, applied over plain
 * text - see `serializer/index.ts`). Confirmed via a failing test before
 * this bridge existed: a plain `Underline` extension round-tripped
 * "underlined" text as literal `++underlined++` in the saved markdown.
 *
 * `.extendExtension()` (the API `BridgeExtension` exposes for exactly this
 * kind of override) does not actually work for this project's setup -
 * confirmed by reading `@10play/tentap-editor`'s own `useTenTap` web-side
 * source, not assumed from the API's shape. It sources each bridge's
 * `extendConfig` from `window.bridgeExtensionConfigMap`, a JSON string only
 * the native RN host ever populates - `.extendExtension()`'s own
 * `extendConfig` field on the bridge object itself is never read by that
 * code path at all, so setting it here would silently do nothing on the web
 * bundle (`AdvancedEditor.tsx`) this project actually loads into the
 * WebView. `.clone()` plus a direct `tiptapExtension` reassignment
 * sidesteps that path entirely: `configureTiptapExtensionsOnRunTime` only
 * *further* modifies `tiptapExtension` when the native config map supplies
 * a non-empty override (it doesn't, by default, for "underline"), so the
 * already-corrected extension set here passes through untouched. Everything
 * else - toggle command, active-state tracking - is TenTap's own real
 * `UnderlineBridge` logic, reused via `.clone()`, not reimplemented.
 *
 * Imported from the bare `@10play/tentap-editor` root, matching
 * `AdvancedEditor.tsx`'s own import - deliberately not `/web`, despite that
 * subpath looking like the more correct choice for a web-only bundle (it's
 * meant to expose `useTenTap`/every bridge without the native-only
 * `RichText`/`react-native-webview` code the bare root's barrel export
 * pulls in). Tried directly, not assumed safe: `/web`'s own `package.json`
 * `exports` entry points at `./lib-web/index.umd.cjs`, a file that does not
 * actually exist on disk (only `index.umd.js`, no `.cjs`, is there) - a
 * real packaging bug in the installed version, confirmed by both Jest
 * ("Cannot find module") and, worse, a real `pnpm run editor:build` failure
 * (`Missing "./web/web" specifier in "@10play/tentap-editor" package`). The
 * bare root is what's proven to build correctly (confirmed via a real Vite
 * build both before and after this bridge existed), so that stays the
 * import path despite the `react-native-webview` coupling - which is
 * harmless in the actual Vite bundle (nothing here ever touches
 * `RichText`, so it tree-shakes away) and only ever surfaces as a genuine,
 * unrelated blocker for directly unit-testing *this file* under Jest (see
 * `bridges/__tests__/underline.test.ts` for how that's worked around
 * without needing this file's import to change).
 */
const UnderlineBridge = DefaultUnderlineBridge.clone()
UnderlineBridge.tiptapExtension = Underline.extend({
  renderMarkdown: (
    node: unknown,
    helpers: {renderChildren: (n: unknown) => string},
  ) => helpers.renderChildren(node),
} as never)

export {UnderlineBridge}
