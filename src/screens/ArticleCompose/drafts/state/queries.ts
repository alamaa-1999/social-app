import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'

import {logger} from '#/logger'
import {STALE} from '#/state/queries'
import {createQueryKey} from '#/state/queries/util'
import {useAppviewClient} from '#/state/session'
import {com} from '#/lexicons'
import {type ArticleComposeState, articleStateToDraft} from './api'

const RQKEY_ROOT = 'article-drafts'
const RQKEY = () => createQueryKey(RQKEY_ROOT, {})

/** Hook to list the signed-in Striker's own article drafts. */
export function useArticleDraftsQuery() {
  const appviewClient = useAppviewClient()

  return useInfiniteQuery({
    queryKey: RQKEY(),
    staleTime: STALE.SECONDS.THIRTY,
    queryFn: async ({pageParam}: {pageParam: string | undefined}) => {
      const data = await appviewClient.call(
        com.sunnahsky.article.draft.getDrafts,
        {cursor: pageParam},
      )
      return {cursor: data.cursor, drafts: data.drafts}
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: page => page.cursor || undefined,
  })
}

/** Hook to save an article draft - creates if `existingDraftId` is absent, updates otherwise. */
export function useSaveArticleDraftMutation() {
  const appviewClient = useAppviewClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      state,
      existingDraftId,
    }: {
      state: ArticleComposeState
      existingDraftId?: string
    }): Promise<{draftId: string}> => {
      const draft = articleStateToDraft(state)

      if (existingDraftId) {
        await appviewClient.call(com.sunnahsky.article.draft.updateDraft, {
          draft: {id: existingDraftId, draft},
        })
        return {draftId: existingDraftId}
      }

      const data = await appviewClient.call(
        com.sunnahsky.article.draft.createDraft,
        {draft},
      )
      return {draftId: data.id}
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: RQKEY()})
    },
  })
}

/** Hook to delete an article draft. */
export function useDeleteArticleDraftMutation() {
  const appviewClient = useAppviewClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({draftId}: {draftId: string}) => {
      await appviewClient.call(com.sunnahsky.article.draft.deleteDraft, {
        id: draftId,
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: RQKEY()})
    },
  })
}

/**
 * Hook to clean up a draft after it has been published. Best-effort, like
 * the post composer's `useCleanupPublishedDraftMutation` - the article was
 * already published successfully by the time this runs, so a failure here
 * is logged, not surfaced to the user.
 */
export function useCleanupPublishedArticleDraftMutation() {
  const appviewClient = useAppviewClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({draftId}: {draftId: string}) => {
      await appviewClient.call(com.sunnahsky.article.draft.deleteDraft, {
        id: draftId,
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: RQKEY()})
    },
    onError: error => {
      logger.warn('Failed to clean up published article draft', {
        safeMessage: error instanceof Error ? error.message : String(error),
      })
    },
  })
}
