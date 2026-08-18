import {useMemo} from 'react'
import {type AtIdentifierString} from '@atproto/syntax'
import {type QueryClient, useQuery} from '@tanstack/react-query'

import {STALE} from '#/state/queries'
import {useStrikersQuery} from '#/state/queries/strikers'
import {useSunnahskyDids} from '#/state/queries/sunnahsky-dids'
import {useAppviewClient, useSession} from '#/state/session'
import {app} from '#/lexicons'
import {createQueryKey} from './util'

export const RQKEY_ROOT = 'sunnahsky-suggested-users'
export const RQKEY = (dids: string[]) => createQueryKey(RQKEY_ROOT, {dids})

/**
 * Replaces Bluesky's real `getSuggestedUsersForExplore`/
 * `getSuggestedOnboardingUsers` recommendation engines (Phase D of
 * `close off external content plan.md`). Those calls have no knowledge of
 * Sunnahsky's DID set - filtering their output against `useSunnahskyDids()`
 * post-fetch would return zero matches almost every time, not a smaller
 * correct list. Instead this samples directly from `useSunnahskyDids()`,
 * Striker-weighted (Strikers surfaced before Catchers, since they're more
 * likely to be worth following first) - not a hard requirement, just a
 * reasonable default given no other ranking signal exists.
 *
 * No topic/category personalization exists for Sunnahsky accounts, so
 * `category` is deliberately not a parameter here - callers that still have
 * a category tab bar (Explore's) will see the same list regardless of tab.
 */
export function useSunnahskySuggestedUsers({
  limit = 10,
}: {
  limit?: number
} = {}) {
  const client = useAppviewClient()
  const {currentAccount} = useSession()
  const {data: sunnahskyDids} = useSunnahskyDids()
  const {data: strikerDids} = useStrikersQuery()

  const candidateDids = useMemo(() => {
    if (!sunnahskyDids) return undefined
    const strikers = new Set(strikerDids ?? [])
    const strikerList: string[] = []
    const others: string[] = []
    for (const did of sunnahskyDids) {
      if (did === currentAccount?.did) continue
      if (strikers.has(did)) {
        strikerList.push(did)
      } else {
        others.push(did)
      }
    }
    return [...strikerList, ...others].slice(0, limit)
  }, [sunnahskyDids, strikerDids, currentAccount?.did, limit])

  return useQuery({
    enabled: !!candidateDids,
    staleTime: STALE.MINUTES.THREE,
    queryKey: RQKEY(candidateDids ?? []),
    queryFn: async () => {
      if (!candidateDids || candidateDids.length === 0) {
        return {actors: [], recId: undefined}
      }
      const res = await client.call(app.bsky.actor.getProfiles, {
        actors: candidateDids as AtIdentifierString[],
      })
      /*
       * getProfiles returns ProfileViewDetailed (a strict superset of the
       * ProfileView type callers like Explore.tsx's own ExploreScreenItems
       * expect - the original Bluesky endpoints this replaces returned
       * ProfileView). Only the $type discriminant differs.
       */
      const actors: app.bsky.actor.defs.ProfileView[] = res.profiles.map(p => ({
        ...p,
        $type: 'app.bsky.actor.defs#profileView' as const,
      }))
      return {actors, recId: undefined}
    },
  })
}

export function* findAllProfilesInQueryData(
  queryClient: QueryClient,
  did: string,
): Generator<app.bsky.actor.defs.ProfileView, void> {
  const responses = queryClient.getQueriesData<{
    actors: app.bsky.actor.defs.ProfileView[]
    recId: string | undefined
  }>({
    queryKey: [RQKEY_ROOT],
  })
  for (const [_key, response] of responses) {
    if (!response) {
      continue
    }
    for (const actor of response.actors) {
      if (actor.did === did) {
        yield actor
      }
    }
  }
}
