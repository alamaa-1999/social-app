import {AtUri, type AtUriString} from '@atproto/syntax'
import {RichText} from '@bsky/sdk/richtext'
import {t} from '@lingui/core/macro'
import {type QueryClient, useQuery, useQueryClient} from '@tanstack/react-query'

import {DISCOVER_FEED_URI, DISCOVER_SAVED_FEED} from '#/lib/constants'
import {sanitizeDisplayName} from '#/lib/strings/display-names'
import {sanitizeHandle} from '#/lib/strings/handles'
import {GCTIME, STALE} from '#/state/queries'
import {RQKEY as listQueryKey} from '#/state/queries/list'
import {usePreferencesQuery} from '#/state/queries/preferences'
import {createQueryKey} from '#/state/queries/util'
import {useAppviewClient, useSession} from '#/state/session'
import {app} from '#/lexicons'
import {router} from '#/routes'
import {type FeedDescriptor} from './post-feed'
import {precacheResolvedUri} from './resolve-uri'

export type FeedSourceFeedInfo = {
  type: 'feed'
  view?: app.bsky.feed.defs.GeneratorView
  uri: string
  feedDescriptor: FeedDescriptor
  route: {
    href: string
    name: string
    params: Record<string, string>
  }
  cid: string
  avatar: string | undefined
  displayName: string
  description: RichText
  creatorDid: string
  creatorHandle: string
  likeCount: number | undefined
  acceptsInteractions?: boolean
  likeUri: string | undefined
  contentMode: app.bsky.feed.defs.GeneratorView['contentMode']
}

export type FeedSourceListInfo = {
  type: 'list'
  view?: app.bsky.graph.defs.ListView
  uri: string
  feedDescriptor: FeedDescriptor
  route: {
    href: string
    name: string
    params: Record<string, string>
  }
  cid: string
  avatar: string | undefined
  displayName: string
  description: RichText
  creatorDid: string
  creatorHandle: string
  contentMode: undefined
}

export type FeedSourceInfo = FeedSourceFeedInfo | FeedSourceListInfo

export function isFeedSourceFeedInfo(
  feed: FeedSourceInfo,
): feed is FeedSourceFeedInfo {
  return feed.type === 'feed'
}

const feedSourceInfoQueryKeyRoot = 'getFeedSourceInfo'
export const feedSourceInfoQueryKey = ({uri}: {uri: string}) => [
  feedSourceInfoQueryKeyRoot,
  uri,
]

const feedSourceNSIDs = {
  feed: 'app.bsky.feed.generator',
  list: 'app.bsky.graph.list',
}

export function hydrateFeedGenerator(
  view: app.bsky.feed.defs.GeneratorView,
): FeedSourceInfo {
  const urip = new AtUri(view.uri)
  const collection =
    urip.collection === 'app.bsky.feed.generator' ? 'feed' : 'lists'
  const href = `/profile/${urip.hostname}/${collection}/${urip.rkey}`
  const route = router.matchPath(href)

  const description = new RichText({
    text: view.description || '',
    facets: (view.descriptionFacets || [])?.slice(),
  })

  if (!view.descriptionFacets) {
    description.detectFacetsWithoutResolution()
  }

  return {
    type: 'feed',
    view,
    uri: view.uri,
    feedDescriptor: `feedgen|${view.uri}`,
    cid: view.cid,
    route: {
      href,
      name: route[0],
      params: route[1],
    },
    avatar: view.avatar,
    displayName: view.displayName
      ? sanitizeDisplayName(view.displayName)
      : t`Feed by ${sanitizeHandle(view.creator.handle, '@')}`,
    description,
    creatorDid: view.creator.did,
    creatorHandle: view.creator.handle,
    likeCount: view.likeCount,
    acceptsInteractions: view.acceptsInteractions,
    likeUri: view.viewer?.like,
    contentMode: view.contentMode,
  }
}

export function hydrateList(
  view: app.bsky.graph.defs.ListView,
): FeedSourceInfo {
  const urip = new AtUri(view.uri)
  const collection =
    urip.collection === 'app.bsky.feed.generator' ? 'feed' : 'lists'
  const href = `/profile/${urip.hostname}/${collection}/${urip.rkey}`
  const route = router.matchPath(href)

  const description = new RichText({
    text: view.description || '',
    facets: (view.descriptionFacets || [])?.slice(),
  })

  if (!view.descriptionFacets) {
    description.detectFacetsWithoutResolution()
  }

  return {
    type: 'list',
    view,
    uri: view.uri,
    feedDescriptor: `list|${view.uri}`,
    route: {
      href,
      name: route[0],
      params: route[1],
    },
    cid: view.cid,
    avatar: view.avatar,
    description,
    creatorDid: view.creator.did,
    creatorHandle: view.creator.handle,
    displayName: view.name
      ? sanitizeDisplayName(view.name)
      : t`User List by ${sanitizeHandle(view.creator.handle, '@')}`,
    contentMode: undefined,
  }
}

export function getFeedTypeFromUri(uri: string) {
  const {pathname} = new AtUri(uri)
  return pathname.includes(feedSourceNSIDs.feed) ? 'feed' : 'list'
}

export function getAvatarTypeFromUri(uri: string) {
  return getFeedTypeFromUri(uri) === 'feed' ? 'algo' : 'list'
}

/**
 * Sunnahsky's synthetic Discover feed has no real `app.bsky.feed.generator`
 * record behind it (it's `StrikerFeedAPI`, not a feedgen) - this builder is
 * the single source of its metadata, shared by {@link useFeedSourceInfoQuery}'s
 * Discover special case, the logged-out {@link PWI_DISCOVER_FEED_STUB}, and
 * the logged-in branch in {@link usePinnedFeedsInfos}, so all three surfaces
 * show the same Sunnahsky-branded info instead of three independent literals
 * that can drift out of sync.
 */
function buildDiscoverFeedSourceInfo(): FeedSourceInfo {
  return {
    type: 'feed',
    displayName: 'Discover',
    uri: DISCOVER_FEED_URI,
    feedDescriptor: `feedgen|${DISCOVER_FEED_URI}`,
    route: {
      href: '/',
      name: 'Home',
      params: {},
    },
    cid: '',
    avatar: '',
    description: new RichText({
      text: 'Posts from Sunnahsky Strikers, newest first.',
    }),
    creatorDid: '',
    creatorHandle: '',
    likeCount: 0,
    likeUri: '',
    contentMode: undefined,
  }
}

export function useFeedSourceInfoQuery({uri}: {uri: string}) {
  const type = getFeedTypeFromUri(uri)
  const client = useAppviewClient()

  return useQuery({
    staleTime: STALE.INFINITY,
    queryKey: feedSourceInfoQueryKey({uri}),
    queryFn: async () => {
      if (uri === DISCOVER_FEED_URI) {
        return buildDiscoverFeedSourceInfo()
      }

      let view: FeedSourceInfo

      if (type === 'feed') {
        const data = await client.call(app.bsky.feed.getFeedGenerator, {
          feed: uri as AtUriString,
        })
        view = hydrateFeedGenerator(data.view)
      } else {
        const data = await client.call(app.bsky.graph.getList, {
          list: uri as AtUriString,
          limit: 1,
        })
        view = hydrateList(data.list)
      }

      return view
    },
  })
}

export type SavedFeedSourceInfo = FeedSourceInfo & {
  savedFeed: app.bsky.actor.defs.SavedFeed
}

const PWI_DISCOVER_FEED_STUB: SavedFeedSourceInfo = {
  ...buildDiscoverFeedSourceInfo(),
  savedFeed: {
    id: 'pwi-discover',
    ...DISCOVER_SAVED_FEED,
  },
}

export const FEED_INFO_RQKEY_ROOT = 'feed-info'

const createPinnedFeedInfosQueryKey = (
  kind: 'pinned' | 'saved',
  feedUris: string[],
) =>
  createQueryKey(
    FEED_INFO_RQKEY_ROOT,
    {
      kind,
      feedUris,
    },
    {
      persistedVersion: 1,
    },
  )

export function usePinnedFeedsInfos() {
  const {hasSession} = useSession()
  const client = useAppviewClient()
  const {data: preferences, isLoading: isLoadingPrefs} = usePreferencesQuery()
  const pinnedItems = preferences?.savedFeeds.filter(feed => feed.pinned) ?? []

  return useQuery({
    queryKey: createPinnedFeedInfosQueryKey(
      'pinned',
      pinnedItems.map(f => f.value),
    ),
    gcTime: GCTIME.INFINITY,
    staleTime: STALE.MINUTES.FIFTEEN,
    enabled: !isLoadingPrefs,
    queryFn: async () => {
      if (!hasSession) {
        return [PWI_DISCOVER_FEED_STUB]
      }

      let resolved = new Map<string, FeedSourceInfo>()

      /*
       * No path exists anymore to pin a non-Discover feed generator, so
       * there's deliberately no generic `getFeedGenerators` resolution here
       * - only Lists and the synthesized Discover entry below are resolved.
       * A stray non-Discover feed entry left over from before this shipped
       * simply falls through every branch below and is dropped silently.
       */
      const pinnedLists = pinnedItems.filter(feed => feed.type === 'list')
      const listsPromises = pinnedLists.map(list =>
        client
          .call(app.bsky.graph.getList, {
            list: list.value as AtUriString,
            limit: 1,
          })
          .then(data => {
            const listView = data.list
            resolved.set(listView.uri, hydrateList(listView))
          }),
      )

      await Promise.allSettled(listsPromises) // Ignore individual failing ones.

      // order the feeds/lists in the order they were pinned
      const result: SavedFeedSourceInfo[] = []
      for (let pinnedItem of pinnedItems) {
        const feedInfo = resolved.get(pinnedItem.value)
        if (feedInfo) {
          result.push({
            ...feedInfo,
            savedFeed: pinnedItem,
          })
        } else if (pinnedItem.type === 'timeline') {
          result.push({
            type: 'feed',
            displayName: 'Following',
            uri: pinnedItem.value,
            feedDescriptor: 'following',
            route: {
              href: '/',
              name: 'Home',
              params: {},
            },
            cid: '',
            avatar: '',
            description: new RichText({text: ''}),
            creatorDid: '',
            creatorHandle: '',
            likeCount: 0,
            likeUri: '',
            savedFeed: pinnedItem,
            contentMode: undefined,
          })
        } else if (
          pinnedItem.type === 'feed' &&
          pinnedItem.value === DISCOVER_FEED_URI
        ) {
          result.push({
            ...buildDiscoverFeedSourceInfo(),
            savedFeed: pinnedItem,
          })
        }
      }
      return result
    },
  })
}

export type SavedFeedItem =
  | {
      type: 'feed'
      config: app.bsky.actor.defs.SavedFeed
      view: app.bsky.feed.defs.GeneratorView
    }
  | {
      type: 'list'
      config: app.bsky.actor.defs.SavedFeed
      view: app.bsky.graph.defs.ListView
    }
  | {
      type: 'timeline'
      config: app.bsky.actor.defs.SavedFeed
      view: undefined
    }
  | {
      type: 'discover'
      config: app.bsky.actor.defs.SavedFeed
      view: undefined
    }

export function useSavedFeeds() {
  const client = useAppviewClient()
  const {data: preferences, isLoading: isLoadingPrefs} = usePreferencesQuery()
  const savedItems = preferences?.savedFeeds ?? []
  const queryClient = useQueryClient()

  return useQuery({
    queryKey: createPinnedFeedInfosQueryKey(
      'saved',
      savedItems.map(f => f.value),
    ),
    gcTime: GCTIME.INFINITY,
    staleTime: STALE.INFINITY,
    enabled: !isLoadingPrefs,
    placeholderData: previousData => {
      return (
        previousData || {
          // The likely count before we try to resolve them.
          count: savedItems.length,
          feeds: [],
        }
      )
    },
    queryFn: async () => {
      const resolvedLists = new Map<string, app.bsky.graph.defs.ListView>()

      /*
       * No path exists anymore to save a non-Discover feed generator, so
       * there's deliberately no generic `getFeedGenerators` resolution here
       * - only Lists are resolved. Discover is synthesized below, same as
       * `usePinnedFeedsInfos` - it must not be resolved via a real feedgen
       * call, since `DISCOVER_FEED_URI` is still a genuine Bluesky feedgen
       * address and would otherwise pull Bluesky's real "whats-hot"
       * branding into this list.
       */
      const savedLists = savedItems.filter(feed => feed.type === 'list')

      const listsPromises = savedLists.map(list =>
        client
          .call(app.bsky.graph.getList, {
            list: list.value as AtUriString,
            limit: 1,
          })
          .then(data => {
            const listView = data.list
            resolvedLists.set(listView.uri, listView)
          }),
      )

      await Promise.allSettled(listsPromises)

      resolvedLists.forEach(list => {
        precacheList(queryClient, list)
      })

      const result: SavedFeedItem[] = []
      for (let savedItem of savedItems) {
        if (savedItem.type === 'timeline') {
          result.push({
            type: 'timeline',
            config: savedItem,
            view: undefined,
          })
        } else if (
          savedItem.type === 'feed' &&
          savedItem.value === DISCOVER_FEED_URI
        ) {
          result.push({
            type: 'discover',
            config: savedItem,
            view: undefined,
          })
        } else if (savedItem.type === 'list') {
          const resolvedList = resolvedLists.get(savedItem.value)
          if (resolvedList) {
            result.push({
              type: 'list',
              config: savedItem,
              view: resolvedList,
            })
          }
        }
      }

      return {
        // By this point we know the real count.
        count: result.length,
        feeds: result,
      }
    },
  })
}

const feedInfoQueryKeyRoot = 'feedInfo'

export function useFeedInfo(feedUri: string | undefined) {
  const client = useAppviewClient()

  return useQuery({
    staleTime: STALE.INFINITY,
    queryKey: [feedInfoQueryKeyRoot, feedUri],
    queryFn: async () => {
      if (!feedUri) {
        return null
      }

      const data = await client.call(app.bsky.feed.getFeedGenerator, {
        feed: feedUri as AtUriString,
      })

      const feedSourceInfo = hydrateFeedGenerator(data.view)
      return feedSourceInfo
    },
  })
}

function precacheFeed(queryClient: QueryClient, hydratedFeed: FeedSourceInfo) {
  precacheResolvedUri(
    queryClient,
    hydratedFeed.creatorHandle,
    hydratedFeed.creatorDid,
  )
  queryClient.setQueryData<FeedSourceInfo>(
    feedSourceInfoQueryKey({uri: hydratedFeed.uri}),
    hydratedFeed,
  )
}

export function precacheList(
  queryClient: QueryClient,
  list: app.bsky.graph.defs.ListView,
) {
  precacheResolvedUri(queryClient, list.creator.handle, list.creator.did)
  queryClient.setQueryData<app.bsky.graph.defs.ListView>(
    listQueryKey(list.uri),
    list,
  )
}

export function precacheFeedFromGeneratorView(
  queryClient: QueryClient,
  view: app.bsky.feed.defs.GeneratorView,
) {
  const hydratedFeed = hydrateFeedGenerator(view)
  precacheFeed(queryClient, hydratedFeed)
}
