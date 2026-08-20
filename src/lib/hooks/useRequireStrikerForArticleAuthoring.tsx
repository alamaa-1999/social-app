import {useCallback} from 'react'
import {useLingui} from '@lingui/react/macro'

import {useIsCatcher} from '#/state/session/role'
import * as Toast from '#/components/Toast'

/**
 * Wraps a callback that opens Article Compose so a Catcher account can never
 * reach it. Unlike `useRequireStrikerForNewPost`, there is no reply-style
 * exception here - articles have no equivalent of "replying to an existing
 * thread," so the block is unconditional.
 *
 * This is UX polish, not the security boundary: the PDS write guard already
 * rejects `site.standard.document`/`publication` writes from Catchers
 * server-side regardless of which client sent the request, so getting this
 * wrong only surfaces a confusing rejected request, never a bypass.
 */
export function useRequireStrikerForArticleAuthoring() {
  const isCatcher = useIsCatcher()
  const {t: l} = useLingui()

  return useCallback(
    (cb: () => void): (() => void) => {
      return () => {
        if (isCatcher) {
          Toast.show(
            l({
              message: 'Only Strikers can write articles.',
              comment:
                'Shown when a Catcher-role account tries to open the article authoring screen.',
              context: 'Toast',
            }),
            {type: 'warning'},
          )
          return
        }
        cb()
      }
    },
    [isCatcher, l],
  )
}
