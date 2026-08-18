import {type AtIdentifierString} from '@atproto/syntax'
import {useQuery} from '@tanstack/react-query'

import {logger} from '#/logger'
import {STALE} from '#/state/queries'
import {useSunnahskyDids} from '#/state/queries/sunnahsky-dids'
import {useAppviewClient} from '#/state/session'
import {app} from '#/lexicons'
import {createQueryKey} from './util'

const RQKEY_ROOT = 'sunnahsky-profiles'
export const RQKEY = (dids: string[]) => createQueryKey(RQKEY_ROOT, {dids})

const GET_PROFILES_BATCH_SIZE = 25 // app.bsky.actor.getProfiles' own `actors` maxLength

/**
 * Full profile data (handle, displayName, avatar, etc.) for every account
 * hosted on Sunnahsky's own PDS - the searchable directory account-typeahead
 * is built on (see `matchSunnahskyProfiles` below), as opposed to Bluesky's
 * real `searchActorsTypeahead`/`searchActors` ranking, which has no
 * awareness of Sunnahsky's accounts and, verified directly against the real
 * AppView, can exclude a genuine Sunnahsky match entirely from even a
 * 100-result fetch for a short/generic query - not a truncation problem,
 * an "algorithm doesn't know this account exists" problem. Matching locally
 * against this list sidesteps that entirely.
 *
 * Deliberately distinct from `useSunnahskySuggestedUsers()`
 * (sunnahsky-suggested-users.ts), which samples a capped, Striker-weighted
 * subset for recommendations - this fetches the full roster, for search.
 *
 * Scale caveat, not yet a problem: this fetches and caches every Sunnahsky
 * account's profile client-side. Fine and instant at the current roster
 * size (a handful of accounts). If that grows into the thousands, this
 * stops being free - worth revisiting the approach then, not a blocker now.
 */
export function useSunnahskyProfiles() {
  const client = useAppviewClient()
  const {data: sunnahskyDids} = useSunnahskyDids()

  return useQuery({
    enabled: !!sunnahskyDids,
    staleTime: STALE.HOURS.ONE,
    queryKey: RQKEY(sunnahskyDids ? [...sunnahskyDids] : []),
    queryFn: async () => {
      const dids = [...sunnahskyDids!]
      const profiles: app.bsky.actor.defs.ProfileViewDetailed[] = []
      try {
        for (let i = 0; i < dids.length; i += GET_PROFILES_BATCH_SIZE) {
          const batch = dids.slice(i, i + GET_PROFILES_BATCH_SIZE)
          const res = await client.call(app.bsky.actor.getProfiles, {
            actors: batch as AtIdentifierString[],
          })
          profiles.push(...res.profiles)
        }
      } catch (e) {
        /*
         * Logged here, once, rather than in each of the three consumers
         * (useAutocomplete, useActorAutocompleteQuery,
         * useActorAutocompleteFn) - all three only ever check
         * `!!sunnahskyProfiles`, not `.error`, so without this a getProfiles
         * failure would silently show zero results on every account-
         * typeahead surface in the app with nothing logged anywhere. Rethrow
         * so useQuery's own error state still works correctly for any
         * consumer that does check it.
         */
        logger.error('useSunnahskyProfiles: getProfiles failed', {
          message: e,
        })
        throw e
      }
      return profiles
    },
  })
}

// A 1-character query trivially substring-matches almost any handle or
// display name (everyone's name contains "a" somewhere), which looks like
// broken/random results rather than useful narrowing - require at least
// this many characters before returning anything, standard for typeahead.
const MIN_QUERY_LENGTH = 2

/**
 * Pure, synchronous local search over an already-fetched Sunnahsky profile
 * list - matches `useAutocomplete()`/`actor-autocomplete.ts`'s existing
 * query-normalization convention (lowercase, trim, drop a trailing dot so
 * "foo" -> "foo." doesn't clear matches). Ranks handle-starts-with first,
 * then displayName-starts-with, then any other substring match, each tier
 * alphabetical - simple on purpose, the roster is tiny.
 */
export function matchSunnahskyProfiles(
  profiles: app.bsky.actor.defs.ProfileViewDetailed[],
  query: string,
  limit: number,
): app.bsky.actor.defs.ProfileViewDetailed[] {
  let q = query.toLowerCase().trim()
  if (q.endsWith('.')) {
    q = q.slice(0, -1)
  }
  if (q.length < MIN_QUERY_LENGTH) return []

  const rank = (p: app.bsky.actor.defs.ProfileViewDetailed): number => {
    const handle = p.handle.toLowerCase()
    const name = p.displayName?.toLowerCase() ?? ''
    if (handle.startsWith(q)) return 0
    if (name.startsWith(q)) return 1
    return 2
  }

  return profiles
    .filter(
      p =>
        p.handle.toLowerCase().includes(q) ||
        p.displayName?.toLowerCase().includes(q),
    )
    .sort((a, b) => {
      const rankDiff = rank(a) - rank(b)
      if (rankDiff !== 0) return rankDiff
      return a.handle.localeCompare(b.handle)
    })
    .slice(0, limit)
}
