import {useQuery} from '@tanstack/react-query'

import {STALE} from '#/state/queries'
import {getSunnahskyPublicPdsClient} from '#/state/session/clients'
import {com} from '#/lexicons'
import {createQueryKey} from './util'

const RQKEY_ROOT = 'sunnahsky-dids'
export const RQKEY = () => createQueryKey(RQKEY_ROOT, {})

/**
 * Every account hosted on Sunnahsky's own PDS - Strikers and Catchers alike
 * - as a `Set` for fast membership checks, backed by `com.atproto.sync.listRepos`
 * (already-public, unauthenticated). Distinct from `useStrikersQuery()`
 * (Strikers only, backed by `com.atproto.temp.listStrikers`) - different
 * scope, different backing route, intentionally not merged into one hook.
 * This list changes only when someone signs up, hence the long staleTime.
 */
export function useSunnahskyDids() {
  return useQuery({
    queryKey: RQKEY(),
    staleTime: STALE.HOURS.ONE,
    queryFn: async () => {
      const client = getSunnahskyPublicPdsClient()
      const dids = new Set<string>()
      let cursor: string | undefined
      do {
        const res = await client.call(com.atproto.sync.listRepos, {
          cursor,
          limit: 1000,
        })
        for (const repo of res.repos) {
          dids.add(repo.did)
        }
        cursor = res.cursor
      } while (cursor)
      return dids
    },
  })
}
