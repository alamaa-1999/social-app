import {Extension} from '@tiptap/core'

/**
 * Registers `dir` as a real, schema-level global attribute on the same node
 * types `typography.ts`/`textAlign.ts` already target - replicating TipTap
 * core's own `TextDirection` extension by hand, rather than relying on it.
 *
 * This file is the single authoritative account of how `dir` works in this
 * editor. Other files reference it rather than restating it - that
 * restating is exactly what went stale three times over (`typography.ts`'s
 * own top comment records that history).
 *
 * Why not TipTap's own `TextDirection`, in two parts. First, it registers
 * no `dir` attribute on any node type at all unless `options.direction` is
 * truthy: `addGlobalAttributes()` opens with `if (!this.options.direction)
 * { return [] }`. That is a *second* gate, separate from the extension
 * being loaded at all via `enableCoreExtensions` - and conflating those two
 * is what hid this bug for a whole session, since ProseMirror's
 * `computeAttrs` then silently drops any attribute a node's schema doesn't
 * declare, discarding every `dir: 'rtl'` write without a trace.
 *
 * Second, and decisively: configuring that option does not help either.
 * Confirmed via `editor.extensionManager.extensions` on a real device -
 * `textDirection` never appears in the running editor's extension list at
 * all, and the core extensions that *are* present match TipTap v2's exact
 * 8-item list. Root cause: `@10play/tentap-
 * editor`'s web entry point (`lib-web/index.mjs`, what this app's own
 * `@10play/tentap-editor` -> `@10play/tentap-editor/web` alias resolves
 * to) is a single, ~80,000-line pre-bundled artifact with `@tiptap/react`/
 * `@tiptap/core` already inlined at the package author's own publish time -
 * no local pnpm alias or Vite `resolve.alias` can reach into an
 * already-bundled file to change which version it was built against
 * (confirmed: that file's own named exports are just `{blueBackgroundPlugin,
 * sendMessage, useTenTap, __parseFromClipboard}` - `Extension`/`Plugin`
 * aren't among them, so there's no live hook to intercept there either).
 *
 * This extension sidesteps the whole problem: it's a plain, regular
 * extension added via `tiptapOptions.extensions` (not TipTap's own
 * core-extension mechanism), processed the same structural way `typography`/
 * `textAlign` already are - confirmed working live regardless of the same
 * version mismatch, since `ExtensionManager` calls extension hooks like
 * `addGlobalAttributes` structurally (checking for the method, calling it),
 * with no version-identity check involved. `typography.ts`'s own bare
 * `@tiptap/core` import (this file's own import below, matching it exactly)
 * is itself proof of this: it's already live and working today.
 *
 * No root-element `dir` here, unlike TipTap's own `TextDirection` (which
 * also sets `dir` on the editor's own DOM element via a ProseMirror plugin,
 * needing `Plugin`/`PluginKey` from `@tiptap/pm/state` - a path this app's
 * Vite config aliases to the same pre-bundled `lib-web/index.mjs`, which
 * doesn't export either name, so that import would fail to resolve the
 * same way `Extension` does above). Not needed: `dir` inherits, so an
 * unset root simply leaves the document at the browser's own default
 * (`ltr`), which is exactly what an unstyled paragraph should be.
 *
 * `default: null`, deliberately - NOT `'ltr'`, and this distinction is
 * load-bearing rather than cosmetic. `dir` is an inherited HTML attribute:
 * a node without it takes its parent's direction. Defaulting to `'ltr'`
 * renders an explicit `dir="ltr"` on every paragraph, which *overrides*
 * that inheritance - and a first version of this file did exactly that,
 * producing `<blockquote dir="rtl"><p dir="ltr">` for Arabic block quotes
 * (found on a real device, in review, not in theory): the quote's own text
 * rendered left-to-right inside a right-to-left quote. Leaving the default
 * null means only deliberate, explicit directions are ever emitted
 * (`paragraphStyle.ts`/`typography.ts`'s `dir: 'rtl'` calls), and
 * everything else - a plain paragraph, a paragraph nested in an Arabic
 * quote, a brand-new paragraph created by pressing Enter inside one -
 * inherits correctly with no per-case wiring. Matches `typography.ts`'s
 * own `default: null` global attribute exactly.
 */

const DIR_NODE_TYPES = ['paragraph', 'blockquote']

export const dirExtension = Extension.create({
  name: 'dir',
  addGlobalAttributes() {
    return [
      {
        types: DIR_NODE_TYPES,
        attributes: {
          dir: {
            default: null,
            parseHTML: (element: HTMLElement) => {
              const dir = element.getAttribute('dir')
              return dir === 'rtl' || dir === 'ltr' || dir === 'auto'
                ? dir
                : null
            },
            renderHTML: (attributes: {dir?: string | null}) => {
              if (!attributes.dir) return {}
              return {dir: attributes.dir}
            },
          },
        },
      },
    ]
  },
})
