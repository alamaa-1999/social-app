import {useCallback} from 'react'
import {moderateProfile, type ModerationOpts} from '@bsky/sdk/moderation'
import {keepPreviousData, useQuery} from '@tanstack/react-query'

import {isJustAMute, moduiContainsHideableOffense} from '#/lib/moderation'
import {STALE} from '#/state/queries'
import {type app} from '#/lexicons'
import {useModerationOpts} from '../preferences/moderation-opts'
import {DEFAULT_LOGGED_OUT_PREFERENCES} from './preferences'
import {
  matchSunnahskyProfiles,
  useSunnahskyProfiles,
} from './sunnahsky-profiles'

const DEFAULT_MOD_OPTS = {
  userDid: undefined,
  prefs: DEFAULT_LOGGED_OUT_PREFERENCES.moderationPrefs,
}

const RQKEY_ROOT = 'actor-autocomplete'
export const RQKEY = (prefix: string) => [RQKEY_ROOT, prefix]

export function useActorAutocompleteQuery(
  prefix: string,
  maintainData?: boolean,
  limit?: number,
) {
  const moderationOpts = useModerationOpts()
  const {data: sunnahskyProfiles} = useSunnahskyProfiles()

  prefix = prefix.toLowerCase().trim()
  if (prefix.endsWith('.')) {
    // Going from "foo" to "foo." should not clear matches.
    prefix = prefix.slice(0, -1)
  }

  /*
   * Matches locally against sunnahskyProfiles (sunnahsky-profiles.ts)
   * rather than fetching Bluesky's real searchActorsTypeahead, which has no
   * awareness of Sunnahsky's accounts and can exclude a genuine match
   * entirely for a short/generic query. `enabled` requires
   * sunnahskyProfiles to have resolved first - without it, a query typed
   * before the list finished loading would cache an empty result for that
   * exact prefix. `select` also carries sunnahskyProfiles in its dependency
   * array: unlike `enabled`, staleTime here means this query won't
   * necessarily refire on its own once the list resolves, so without this
   * `select` would keep re-deriving from whatever (possibly still-empty)
   * value it first closed over.
   */
  return useQuery<app.bsky.actor.defs.ProfileViewDetailed[]>({
    enabled: !!sunnahskyProfiles,
    staleTime: STALE.MINUTES.ONE,
    queryKey: RQKEY(prefix || ''),
    queryFn() {
      return sunnahskyProfiles ?? []
    },
    select: useCallback(
      (data: app.bsky.actor.defs.ProfileViewDetailed[]) => {
        return computeSuggestions({
          q: prefix,
          sunnahskyProfiles: data,
          moderationOpts: moderationOpts || DEFAULT_MOD_OPTS,
          limit: limit || 8,
        })
      },
      [prefix, moderationOpts, limit, sunnahskyProfiles],
    ),
    placeholderData: maintainData ? keepPreviousData : undefined,
  })
}

export type ActorAutocompleteFn = ReturnType<typeof useActorAutocompleteFn>
export function useActorAutocompleteFn() {
  const moderationOpts = useModerationOpts()
  const {data: sunnahskyProfiles} = useSunnahskyProfiles()

  return useCallback(
    ({query, limit = 8}: {query: string; limit?: number}) => {
      query = query.toLowerCase()

      /*
       * This is an imperative function, not a reactive query, so there's no
       * `enabled` to lean on - a caller could invoke this before
       * sunnahskyProfiles has resolved. Guard explicitly rather than
       * matching against an empty list, which would look identical to "no
       * matches" instead of "still loading."
       */
      if (!sunnahskyProfiles) return []

      return computeSuggestions({
        q: query,
        sunnahskyProfiles,
        moderationOpts: moderationOpts || DEFAULT_MOD_OPTS,
        limit,
      })
    },
    [moderationOpts, sunnahskyProfiles],
  )
}

function computeSuggestions({
  q,
  sunnahskyProfiles,
  moderationOpts,
  limit,
}: {
  q?: string
  sunnahskyProfiles: app.bsky.actor.defs.ProfileViewDetailed[]
  moderationOpts: ModerationOpts
  limit: number
}) {
  const matches = matchSunnahskyProfiles(sunnahskyProfiles, q ?? '', limit)
  return matches.filter(profile => {
    const modui = moderateProfile(profile, moderationOpts).ui('profileList')
    const isExactMatch = q && profile.handle.toLowerCase() === q
    return (
      (isExactMatch && !moduiContainsHideableOffense(modui)) ||
      !modui.filter ||
      isJustAMute(modui)
    )
  })
}
