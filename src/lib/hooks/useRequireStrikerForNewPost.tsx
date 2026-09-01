import {useCallback} from 'react'
import {useLingui} from '@lingui/react/macro'

import {useIsCatcher} from '#/state/session/role'
import {type ComposerOptsPostRef} from '#/state/shell/composer'
import * as Toast from '#/components/Toast'

/**
 * A Catcher account can never open the composer for a new top-level post
 * (no `replyTo`) - only for a reply. Returns whether the given gate context
 * (a `ComposerOpts` for the synchronous open path, or just the future
 * `replyTo` for the async one - see `useOpenComposer`) is blocked, showing
 * the same toast either way it's used, so both paths share one definition
 * of what "blocked" means rather than reproducing this check per caller.
 *
 * This is UX polish, not the security boundary: the PDS enforces the same
 * rule server-side regardless of which client sent the request, so getting
 * this wrong only surfaces a confusing rejected request, never a bypass.
 */
export function useRequireStrikerForNewPost() {
  const isCatcher = useIsCatcher()
  const {t: l} = useLingui()

  return useCallback(
    (gateContext: {replyTo?: ComposerOptsPostRef}): boolean => {
      if (isCatcher && !gateContext.replyTo) {
        Toast.show(
          l({
            message:
              'You can only reply to existing posts, not create new ones.',
            comment:
              'Shown when a Catcher-role account tries to open the composer for a new top-level post rather than a reply.',
            context: 'Toast',
          }),
          {type: 'warning'},
        )
        return true
      }
      return false
    },
    [isCatcher, l],
  )
}
