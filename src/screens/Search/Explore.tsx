import {useCallback, useMemo, useRef, useState} from 'react'
import {View, type ViewabilityConfig} from 'react-native'
import {Trans, useLingui} from '@lingui/react/macro'
import {useQueryClient} from '@tanstack/react-query'
import * as bcp47Match from 'bcp-47-match'

import {useInterestsDisplayNames} from '#/lib/interests'
import {cleanError} from '#/lib/strings/errors'
import {useLanguagePrefs} from '#/state/preferences/languages'
import {useModerationOpts} from '#/state/preferences/moderation-opts'
import {RQKEY_ROOT as useActorSearchQueryKeyRoot} from '#/state/queries/actor-search'
import {Nux, useNux} from '#/state/queries/nuxs'
import {
  RQKEY_ROOT as sunnahskySuggestedUsersQueryKeyRoot,
  useSunnahskySuggestedUsers,
} from '#/state/queries/sunnahsky-suggested-users'
import {List} from '#/view/com/util/List'
import {ExploreInterestsCard} from '#/screens/Search/modules/ExploreInterestsCard'
import {atoms as a, native, platform, useTheme} from '#/alf'
import {Admonition} from '#/components/Admonition'
import {CircleInfo_Stroke2_Corner0_Rounded as CircleInfo} from '#/components/icons/CircleInfo'
import {
  type Props as IcoProps,
  type Props as SVGIconProps,
} from '#/components/icons/common'
import {UserCircle_Stroke2_Corner0_Rounded as Person} from '#/components/icons/UserCircle'
import * as ProfileCard from '#/components/ProfileCard'
import {Text} from '#/components/Typography'
import {type Metrics, useAnalytics} from '#/analytics'
import {ExploreScreenLiveEventFeedsBanner} from '#/features/liveEvents/components/ExploreScreenLiveEventFeedsBanner'
import {type app} from '#/lexicons'
import * as ModuleHeader from './components/ModuleHeader'
import {
  SuggestedAccountsTabBar,
  SuggestedProfileCard,
} from './modules/ExploreSuggestedAccounts'

type ExploreScreenItems =
  | {
      type: 'topBorder'
      key: string
    }
  | {
      type: 'tabbedHeader'
      key: string
      title: string
      icon: React.ComponentType<SVGIconProps>
      iconSize?: IcoProps['size']
      searchButton?: {
        label: string
        metricsTag: Metrics['explore:module:searchButtonPress']['module']
        tab: 'user' | 'profile' | 'feed'
      }
      hideDefaultTab?: boolean
    }
  | {
      type: 'profile'
      key: string
      profile: app.bsky.actor.defs.ProfileView
      recId?: string
    }
  | {
      type: 'profileEmpty'
      key: 'profileEmpty'
    }
  | {
      type: 'profilePlaceholder'
      key: string
    }
  | {
      type: 'error'
      key: string
      message: string
      error: string
    }
  | {
      type: 'interests-card'
      key: 'interests-card'
    }
  | {
      type: 'liveEventFeedsBanner'
      key: string
    }

export function Explore({
  focusSearchInput,
}: {
  focusSearchInput: (tab: 'user' | 'profile' | 'feed') => void
  headerHeight: number
}) {
  const ax = useAnalytics()
  const {t: l} = useLingui()
  const t = useTheme()
  const moderationOpts = useModerationOpts()
  const [selectedInterest, setSelectedInterest] = useState<string | null>(null)

  /*
   * Begin special language handling
   */
  const {contentLanguages} = useLanguagePrefs()
  const useFullExperience = useMemo(() => {
    if (contentLanguages.length === 0) return true
    return bcp47Match.basicFilter('en', contentLanguages).length > 0
  }, [contentLanguages])
  const interestsDisplayNames = useInterestsDisplayNames()
  const {
    data: suggestedUsers,
    isLoading: suggestedUsersIsLoading,
    error: suggestedUsersError,
    isRefetching: suggestedUsersIsRefetching,
  } = useSunnahskySuggestedUsers()
  /* End special language handling */

  const interestsNux = useNux(Nux.ExploreInterestsCard)
  const showInterestsNux =
    interestsNux.status === 'ready' && !interestsNux.nux?.completed

  const qc = useQueryClient()
  const [isPTR, setIsPTR] = useState(false)
  const onPTR = useCallback(async () => {
    setIsPTR(true)
    await Promise.all([
      qc.resetQueries({
        queryKey: [sunnahskySuggestedUsersQueryKeyRoot],
      }),
      qc.resetQueries({
        queryKey: [useActorSearchQueryKeyRoot],
      }),
    ])
    setIsPTR(false)
  }, [qc, setIsPTR])

  const topBorder = useMemo(
    () =>
      ({
        type: 'topBorder',
        key: 'top-border',
      }) as const,
    [],
  )
  const suggestedFollowsModule = useMemo(() => {
    const i: ExploreScreenItems[] = []
    i.push({
      type: 'tabbedHeader',
      key: 'suggested-accounts-header',
      title: l`Suggested accounts`,
      icon: Person,
      iconSize: 'md',
      searchButton: {
        label: l`Search for more accounts`,
        metricsTag: 'suggestedAccounts',
        tab: 'user',
      },
      hideDefaultTab: !useFullExperience,
    })

    if (suggestedUsersIsLoading || suggestedUsersIsRefetching) {
      i.push({type: 'profilePlaceholder', key: 'profilePlaceholder'})
    } else if (suggestedUsersError) {
      i.push({
        type: 'error',
        key: 'suggestedUsersError',
        message: l`Failed to load suggested follows`,
        error: cleanError(suggestedUsersError),
      })
    } else {
      if (suggestedUsers !== undefined) {
        if (suggestedUsers.actors.length > 0 && moderationOpts) {
          // Currently the responses contain duplicate items.
          // Needs to be fixed on backend, but let's dedupe to be safe.
          let seen = new Set()
          const profileItems: ExploreScreenItems[] = []
          for (const actor of suggestedUsers.actors) {
            // checking for following still necessary if search data is used
            if (!seen.has(actor.did) && !actor.viewer?.following) {
              seen.add(actor.did)
              profileItems.push({
                type: 'profile',
                key: actor.did,
                profile: actor,
                recId: suggestedUsers.recId,
              })
            }
          }

          if (profileItems.length === 0) {
            i.push({
              type: 'profileEmpty',
              key: 'profileEmpty',
            })
          } else {
            if (selectedInterest === null && useFullExperience) {
              // First "For You" tab, only show 5 to keep screen short
              i.push(...profileItems.slice(0, 5))
            } else {
              i.push(...profileItems)
            }
          }
        } else {
          i.push({
            type: 'profileEmpty',
            key: 'profileEmpty',
          })
        }
      } else {
        i.push({type: 'profilePlaceholder', key: 'profilePlaceholder'})
      }
    }
    return i
  }, [
    l,
    moderationOpts,
    suggestedUsers,
    suggestedUsersIsLoading,
    suggestedUsersIsRefetching,
    suggestedUsersError,
    selectedInterest,
    useFullExperience,
  ])

  const interestsNuxModule = useMemo<ExploreScreenItems[]>(() => {
    if (!showInterestsNux) return []
    return [
      {
        type: 'interests-card',
        key: 'interests-card',
      },
    ]
  }, [showInterestsNux])

  const items = useMemo<ExploreScreenItems[]>(() => {
    const i: ExploreScreenItems[] = []

    i.push(topBorder)
    i.push(...interestsNuxModule)
    i.push({type: 'liveEventFeedsBanner', key: 'liveEventFeedsBanner'})
    i.push(...suggestedFollowsModule)

    return i
  }, [topBorder, suggestedFollowsModule, interestsNuxModule])

  const renderItem = useCallback(
    ({item, index}: {item: ExploreScreenItems; index: number}) => {
      switch (item.type) {
        case 'topBorder':
          return (
            <View style={[a.w_full, t.atoms.border_contrast_low, a.border_t]} />
          )
        case 'tabbedHeader': {
          return (
            <View style={[a.pb_md]}>
              <ModuleHeader.Container style={[a.pb_xs]}>
                <ModuleHeader.Icon icon={item.icon} size={item.iconSize} />
                <ModuleHeader.TitleText>{item.title}</ModuleHeader.TitleText>
                {item.searchButton && (
                  <ModuleHeader.SearchButton
                    {...item.searchButton}
                    onPress={() =>
                      focusSearchInput(item.searchButton?.tab || 'user')
                    }
                  />
                )}
              </ModuleHeader.Container>
              <SuggestedAccountsTabBar
                selectedInterest={selectedInterest}
                onSelectInterest={setSelectedInterest}
                hideDefaultTab={item.hideDefaultTab}
              />
            </View>
          )
        }
        case 'profile': {
          return (
            <SuggestedProfileCard
              profile={item.profile}
              moderationOpts={moderationOpts!}
              recId={item.recId}
              position={index}
            />
          )
        }
        case 'profileEmpty': {
          return (
            <View style={[a.px_lg, a.pb_lg]}>
              <Admonition>
                {selectedInterest ? (
                  <Trans>
                    No results for "{interestsDisplayNames[selectedInterest]}".
                  </Trans>
                ) : (
                  <Trans>No results.</Trans>
                )}
              </Admonition>
            </View>
          )
        }
        case 'profilePlaceholder': {
          return (
            <>
              {Array.from({length: 3}).map((__, i) => (
                <View
                  style={[
                    a.px_lg,
                    a.py_lg,
                    a.border_t,
                    t.atoms.border_contrast_low,
                  ]}
                  key={i}>
                  <ProfileCard.Outer>
                    <ProfileCard.Header>
                      <ProfileCard.AvatarPlaceholder />
                      <ProfileCard.NameAndHandlePlaceholder />
                    </ProfileCard.Header>
                    <ProfileCard.DescriptionPlaceholder numberOfLines={2} />
                  </ProfileCard.Outer>
                </View>
              ))}
            </>
          )
        }
        case 'error': {
          return (
            <View
              style={[
                a.border_t,
                a.pt_md,
                a.px_md,
                t.atoms.border_contrast_low,
              ]}>
              <View
                style={[
                  a.flex_row,
                  a.gap_md,
                  a.p_lg,
                  a.rounded_sm,
                  t.atoms.bg_contrast_25,
                ]}>
                <CircleInfo size="md" fill={t.palette.negative_400} />
                <View style={[a.flex_1, a.gap_sm]}>
                  <Text style={[a.font_semi_bold, a.leading_snug]}>
                    {item.message}
                  </Text>
                  <Text
                    style={[
                      a.italic,
                      a.leading_snug,
                      t.atoms.text_contrast_medium,
                    ]}>
                    {item.error}
                  </Text>
                </View>
              </View>
            </View>
          )
        }
        case 'interests-card': {
          return <ExploreInterestsCard />
        }
        case 'liveEventFeedsBanner': {
          return <ExploreScreenLiveEventFeedsBanner />
        }
      }
    },
    [
      t.atoms.border_contrast_low,
      t.atoms.bg_contrast_25,
      t.atoms.text_contrast_medium,
      t.palette.negative_400,
      focusSearchInput,
      selectedInterest,
      moderationOpts,
      interestsDisplayNames,
    ],
  )

  const stickyHeaderIndices = useMemo(
    () =>
      items.reduce(
        (acc, curr) =>
          curr.type === 'topBorder' ? acc.concat(items.indexOf(curr)) : acc,
        [] as number[],
      ),
    [items],
  )

  // track headers and report module viewability
  const alreadyReportedRef = useRef<Map<string, string>>(new Map())
  const seenProfilesRef = useRef<Set<string>>(new Set())
  const onItemSeen = useCallback(
    (item: ExploreScreenItems) => {
      let module: Metrics['explore:module:seen']['module']
      if (item.type === 'profile') {
        module = 'suggestedAccounts'
        // Track individual profile seen events
        if (!seenProfilesRef.current.has(item.profile.did)) {
          seenProfilesRef.current.add(item.profile.did)
          const position = suggestedFollowsModule.findIndex(
            i => i.type === 'profile' && i.profile.did === item.profile.did,
          )
          ax.metric('suggestedUser:seen', {
            logContext: 'Explore',
            recId: item.recId,
            position: position !== -1 ? position - 1 : 0, // -1 to account for header
            suggestedDid: item.profile.did,
            category: null,
          })
        }
      } else {
        return
      }
      if (!alreadyReportedRef.current.has(module)) {
        alreadyReportedRef.current.set(module, module)
        ax.metric('explore:module:seen', {module})
      }
    },
    [ax, suggestedFollowsModule],
  )

  const handleOnRefresh = () => {
    void onPTR()
  }

  return (
    <List
      data={items}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      desktopFixedHeight
      contentContainerStyle={{paddingBottom: 100}}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      stickyHeaderIndices={native(stickyHeaderIndices)}
      viewabilityConfig={viewabilityConfig}
      onItemSeen={onItemSeen}
      /**
       * Default: 2
       */
      onEndReachedThreshold={4}
      /**
       * Default: 10
       */
      initialNumToRender={10}
      /**
       * Default: 21
       */
      windowSize={platform({android: 11})}
      /**
       * Default: 10
       *
       * NOTE: This was 1 on Android. Unfortunately this leads to the list totally freaking out
       * when the sticky headers changed. I made a minimal reproduction and yeah, it's this prop.
       * Totally fine when the sticky headers are static, but when they're dynamic, it's a mess.
       *
       * Repro: https://github.com/mozzius/stickyindices-repro
       *
       * I then found doubling this prop on iOS also reduced it freaking out there as well.
       *
       * Trades off seeing more blank space due to it having to render more items before it can show anything.
       * -sfn
       */
      maxToRenderPerBatch={platform({android: 10, ios: 20})}
      /**
       * Default: 50
       *
       * NOTE: This was 25 on Android. However, due to maxToRenderPerBatch being set to 10,
       * the lower batching period is no longer necessary (?)
       */
      updateCellsBatchingPeriod={50}
      refreshing={isPTR}
      onRefresh={handleOnRefresh}
    />
  )
}

function keyExtractor(item: ExploreScreenItems) {
  return item.key
}

const viewabilityConfig: ViewabilityConfig = {
  itemVisiblePercentThreshold: 100,
}
