import {useMemo} from 'react'
import {Trans} from '@lingui/react/macro'

import {useRequireEmailVerification} from '#/lib/hooks/useRequireEmailVerification'
import {useRequireStrikerForNewPost} from '#/lib/hooks/useRequireStrikerForNewPost'
import {useOpenComposer as useRootOpenComposer} from '#/state/shell/composer'

export function useOpenComposer() {
  const {openComposer} = useRootOpenComposer()
  const requireEmailVerification = useRequireEmailVerification()
  const requireStrikerForNewPost = useRequireStrikerForNewPost()
  return useMemo(() => {
    return {
      openComposer: requireEmailVerification(
        requireStrikerForNewPost(openComposer),
        {
          instructions: [
            <Trans key="pre-compose">
              Before creating a post or replying, you must first verify your
              email.
            </Trans>,
          ],
        },
      ),
    }
  }, [openComposer, requireEmailVerification, requireStrikerForNewPost])
}
