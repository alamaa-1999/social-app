import {useQuery} from '@tanstack/react-query'

import {STALE} from '#/state/queries'
import {getSunnahskyPublicPdsClient} from '#/state/session/clients'
import {com} from '#/lexicons'
import {createQueryKey} from './util'

const RQKEY_ROOT = 'strikers'
export const RQKEY = () => createQueryKey(RQKEY_ROOT, {})

/**
 * Every active Striker's DID, backing the synthetic Discover feed
 * (`StrikerFeedAPI`). Strikers-only, distinct from `useSunnahskyDids()`
 * (all Sunnahsky accounts, Strikers and Catchers, backed by
 * `com.atproto.sync.listRepos`) - different scope, different backing route,
 * intentionally not merged into one hook. This list changes rarely, hence
 * the long staleTime.
 */
export function useStrikersQuery() {
  return useQuery({
    queryKey: RQKEY(),
    staleTime: STALE.HOURS.ONE,
    queryFn: async () => {
      const client = getSunnahskyPublicPdsClient()
      const dids: string[] = []
      let cursor: string | undefined
      do {
        const res = await client.call(com.atproto.temp.listStrikers, {
          cursor,
          limit: 1000,
        })
        dids.push(...res.strikers.map(striker => striker.did))
        cursor = res.cursor
      } while (cursor)
      return dids
    },
  })
}
