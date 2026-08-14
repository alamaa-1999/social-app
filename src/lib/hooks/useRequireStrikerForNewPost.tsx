import {useCallback} from 'react'
import {useLingui} from '@lingui/react/macro'

import {useIsCatcher} from '#/state/session/role'
import {type ComposerOpts} from '#/state/shell/composer'
import * as Toast from '#/components/Toast'

/**
 * Wraps `openComposer` so a Catcher account can never open the composer for
 * a new top-level post (no `replyTo`) - only for a reply.
 *
 * This is UX polish, not the security boundary: the PDS enforces the same
 * rule server-side regardless of which client sent the request, so getting
 * this wrong only surfaces a confusing rejected request, never a bypass.
 */
export function useRequireStrikerForNewPost() {
  const isCatcher = useIsCatcher()
  const {t: l} = useLingui()

  return useCallback(
    (cb: (opts: ComposerOpts) => void): ((opts: ComposerOpts) => void) => {
      return opts => {
        if (isCatcher && !opts.replyTo) {
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
          return
        }
        cb(opts)
      }
    },
    [isCatcher, l],
  )
}
