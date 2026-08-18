import {useCallback, useMemo} from 'react'
import {moderateProfile, type ModerationOpts} from '@bsky/sdk/moderation'
import {keepPreviousData, useQuery} from '@tanstack/react-query'

import {isJustAMute, moduiContainsHideableOffense} from '#/lib/moderation'
import {useModerationOpts} from '#/state/preferences/moderation-opts'
import {STALE} from '#/state/queries'
import {DEFAULT_LOGGED_OUT_PREFERENCES} from '#/state/queries/preferences'
import {
  matchSunnahskyProfiles,
  useSunnahskyProfiles,
} from '#/state/queries/sunnahsky-profiles'
import {
  type AutocompleteApi,
  type AutocompleteItem,
  type AutocompleteItemType,
  type AutocompleteProfile,
} from '#/components/Autocomplete/types'
import {useEmojiSearch} from './useEmojiSearch'

const DEFAULT_MOD_OPTS = {
  userDid: undefined,
  prefs: DEFAULT_LOGGED_OUT_PREFERENCES.moderationPrefs,
}

export function useAutocomplete({
  type,
  query: q,
  limit,
  showSearchFallback = false,
}: {
  type: AutocompleteItemType
  query: string
  limit?: number
  showSearchFallback?: boolean
}): AutocompleteApi {
  const moderationOpts = useModerationOpts()
  const {data: sunnahskyProfiles} = useSunnahskyProfiles()
  const emojiSearch = useEmojiSearch()

  /*
   * Profile results are matched locally against `sunnahskyProfiles` (see
   * sunnahsky-profiles.ts) inside `queryFn` below, rather than fetched from
   * Bluesky's real searchActorsTypeahead - that ranking has no awareness of
   * Sunnahsky's accounts and can exclude a genuine match entirely for a
   * short/generic query. `enabled` requires `sunnahskyProfiles` to have
   * resolved before this ever fires for `type === 'profile'` - without it,
   * a query typed before the list finished loading would permanently cache
   * an empty result for that exact `{type, query}` key. A `select`-level
   * dependency-array fix (needed elsewhere in this project for the same
   * class of bug) isn't needed here on top of that: `q` is already part of
   * `queryKey`, so every keystroke is its own fresh `queryFn` call reading
   * whatever `sunnahskyProfiles` is current at that render, not a cached
   * closure from an earlier one. `type === 'emoji'` is unaffected, since no
   * Sunnahsky-scoping concept applies to it.
   */
  const query = useQuery({
    enabled: type !== 'profile' || !!sunnahskyProfiles,
    staleTime: STALE.MINUTES.ONE,
    queryKey: [
      'autocomplete',
      {
        type,
        query: q,
      },
    ],
    async queryFn() {
      if (type === 'profile') {
        // TODO return recents
        if (!q) return []

        // Going from "foo" to "foo." should not clear matches.
        q = q.toLowerCase().trim().replace(/\.$/, '')

        const matches = matchSunnahskyProfiles(
          sunnahskyProfiles ?? [],
          q,
          limit || 8,
        )

        return matches.map(profile => ({
          key: profile.did,
          type: 'profile' as const,
          value: '@' + profile.handle,
          profile,
        }))
      } else if (type === 'emoji') {
        return emojiSearch(q, limit || 8)
      }

      return []
    },
    select: useCallback(
      (items: AutocompleteItem[]) => {
        const seen = new Set<string>()
        let results: AutocompleteItem[] = []

        for (const item of items) {
          if (seen.has(item.key)) continue
          seen.add(item.key)

          if (item.type === 'profile') {
            const moderated = moderateProfileItem({
              query: q,
              item,
              moderationOpts: moderationOpts || DEFAULT_MOD_OPTS,
            })
            if (moderated) results.push(moderated)
          } else {
            results.push(item)
          }
        }

        return results
      },
      [q, moderationOpts],
    ),
    placeholderData: keepPreviousData,
  })

  const items = useMemo(() => {
    if (!query.data) {
      return []
    }

    const results = [...query.data]

    if (showSearchFallback && q) {
      results.unshift({
        key: `search-${q}`,
        type: 'search' as const,
        value: q,
      })
    }

    return results
  }, [query.data, showSearchFallback, q])

  return {
    query: q,
    items,
    isFetching: query.isFetching,
  }
}

function moderateProfileItem({
  query,
  item,
  moderationOpts,
}: {
  query: string
  item: AutocompleteProfile
  moderationOpts: ModerationOpts
}) {
  const modui = moderateProfile(item.profile, moderationOpts).ui('profileList')
  const isExactMatch = query && item.profile.handle.toLowerCase() === query

  if (
    (isExactMatch && !moduiContainsHideableOffense(modui)) ||
    !modui.filter ||
    isJustAMute(modui)
  ) {
    return item
  }

  return null
}
