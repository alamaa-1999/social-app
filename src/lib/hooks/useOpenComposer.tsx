import {Trans} from '@lingui/react/macro'

import {useRequireEmailVerification} from '#/lib/hooks/useRequireEmailVerification'
import {useRequireStrikerForNewPost} from '#/lib/hooks/useRequireStrikerForNewPost'
import {
  type ComposerOpts,
  type ComposerOptsPostRef,
  useOpenComposer as useRootOpenComposer,
} from '#/state/shell/composer'

const EMAIL_VERIFICATION_CONFIG = {
  instructions: [
    <Trans key="pre-compose">
      Before creating a post or replying, you must first verify your email.
    </Trans>,
  ],
}

/**
 * `openComposer`'s two call shapes, both returning `void` - a plain union
 * parameter would infer a union return type (`void | Promise<void>`), which
 * every one of this app's many existing fire-and-forget call sites
 * (`onPress={() => openComposer(opts)}`) would then trip `no-floating-promises`
 * on, since the type checker could no longer see the sync branch always
 * genuinely returns `void`. Expressed here as a call-signature type applied
 * to a single implementation (see below) rather than as repeated `function`
 * overload declarations in the hook body - this codebase runs React Compiler
 * (an RC build) and function-declaration overloads sharing one name is an
 * unusual enough shape that it's worth avoiding inside a hook body on that
 * basis alone.
 */
type OpenComposerDispatch = {
  (opts: ComposerOpts): void
  (
    buildOpts: () => Promise<ComposerOpts>,
    gateContext?: {replyTo?: ComposerOptsPostRef},
  ): void
}

/**
 * Two call shapes:
 *
 * - `openComposer(opts)` - the ordinary, synchronous open, unchanged.
 * - `openComposer(buildOpts, gateContext)` - for a caller that has to do
 *   async work (a fetch, a thumb upload) to produce `ComposerOpts` before
 *   there's anything to gate. `gateContext` carries just enough of the
 *   eventual opts (today, only whether this will be a reply) for the same
 *   Catcher/email-verification checks the sync path already runs to decide
 *   *before* `buildOpts` is ever invoked - so a blocked account never
 *   triggers the work `buildOpts` would have done. Both shapes route
 *   through the exact same two gates, composed once, here - a call site
 *   never re-implements them.
 */
export function useOpenComposer() {
  const {openComposer} = useRootOpenComposer()
  const requireEmailVerification = useRequireEmailVerification()
  const isBlockedAsCatcher = useRequireStrikerForNewPost()

  function openComposerSync(opts: ComposerOpts) {
    if (isBlockedAsCatcher(opts)) return
    openComposer(opts)
  }
  async function openComposerFromBuilder(
    buildOpts: () => Promise<ComposerOpts>,
    gateContext: {replyTo?: ComposerOptsPostRef} = {},
  ) {
    if (isBlockedAsCatcher(gateContext)) return
    openComposer(await buildOpts())
  }

  const gatedSync = requireEmailVerification(
    openComposerSync,
    EMAIL_VERIFICATION_CONFIG,
  )
  const gatedAsync = requireEmailVerification(
    openComposerFromBuilder,
    EMAIL_VERIFICATION_CONFIG,
  )

  const dispatchOpenComposer = ((
    optsOrBuildOpts: ComposerOpts | (() => Promise<ComposerOpts>),
    gateContext?: {replyTo?: ComposerOptsPostRef},
  ) => {
    if (typeof optsOrBuildOpts === 'function') {
      void gatedAsync(optsOrBuildOpts, gateContext)
      return
    }
    gatedSync(optsOrBuildOpts)
  }) as OpenComposerDispatch

  return {openComposer: dispatchOpenComposer}
}
