import {
  type InfiniteData,
  keepPreviousData,
  type QueryClient,
  type QueryKey,
  useInfiniteQuery,
} from '@tanstack/react-query'

import {STALE} from '#/state/queries'
import {
  matchSunnahskyProfiles,
  useSunnahskyProfiles,
} from '#/state/queries/sunnahsky-profiles'
import {type app} from '#/lexicons'

export const RQKEY_ROOT = 'actor-search'
export const RQKEY = (query: string, limit?: number) => [
  RQKEY_ROOT,
  query,
  limit,
]

type SearchActorsPage = {actors: app.bsky.actor.defs.ProfileViewDetailed[]}

/**
 * Matches locally against `useSunnahskyProfiles()` (sunnahsky-profiles.ts)
 * rather than fetching Bluesky's real `app.bsky.actor.searchActors`.
 * Verified directly against the real AppView: `searchActors` is ranked the
 * same way `searchActorsTypeahead` is (see sunnahsky-profiles.ts's own doc
 * comment) - a genuine Sunnahsky match can be entirely absent from even a
 * 100-result fetch for a plain query like "ABDULLAH", not just ranked low.
 * Same fix as today's earlier account-typeahead rewrite, reusing the same
 * primitive rather than inventing a second one.
 *
 * `query === '*'` is a wildcard convention one caller
 * (StarterPack/Wizard/StepProfiles.tsx) relies on to mean "give me
 * whatever Sunnahsky accounts you have, not a real search" - preserved
 * here rather than treated as a literal (and useless) substring query.
 *
 * Still a `useInfiniteQuery` returning `InfiniteData` so every existing
 * caller's `.pages.flatMap(...)` access pattern keeps working unchanged,
 * even though local matching only ever produces one page - there's no
 * more to paginate into, so `getNextPageParam` always returns `undefined`.
 */
export function useActorSearch({
  query,
  enabled,
  maintainData,
  limit = 25,
}: {
  query: string
  enabled?: boolean
  maintainData?: boolean
  limit?: number
}) {
  const {data: sunnahskyProfiles} = useSunnahskyProfiles()
  return useInfiniteQuery<
    SearchActorsPage,
    Error,
    InfiniteData<SearchActorsPage>,
    QueryKey,
    string | undefined
  >({
    staleTime: STALE.MINUTES.FIVE,
    queryKey: RQKEY(query, limit),
    queryFn: () => {
      const profiles = sunnahskyProfiles ?? []
      const actors =
        query === '*'
          ? profiles.slice(0, limit)
          : matchSunnahskyProfiles(profiles, query, limit)
      return {actors}
    },
    // `sunnahskyProfiles` gates `enabled` (see sunnahsky-profiles.ts and
    // today's other fixes for why) so this never fires with an incomplete
    // list and permanently caches an empty result for this query key.
    enabled: enabled && !!query && !!sunnahskyProfiles,
    initialPageParam: undefined,
    getNextPageParam: () => undefined,
    placeholderData: maintainData ? keepPreviousData : undefined,
    select,
  })
}

function select(data: InfiniteData<SearchActorsPage>) {
  // enforce uniqueness
  const dids = new Set()

  return {
    ...data,
    pages: data.pages.map(page => ({
      actors: page.actors.filter(actor => {
        if (dids.has(actor.did)) {
          return false
        }
        dids.add(actor.did)
        return true
      }),
    })),
  }
}

export function* findAllProfilesInQueryData(
  queryClient: QueryClient,
  did: string,
) {
  const queryDatas = queryClient.getQueriesData<InfiniteData<SearchActorsPage>>(
    {
      queryKey: [RQKEY_ROOT],
    },
  )
  for (const [_queryKey, queryData] of queryDatas) {
    if (!queryData) {
      continue
    }
    for (const actor of queryData.pages.flatMap(page => page.actors)) {
      if (actor.did === did) {
        yield actor
      }
    }
  }
}
