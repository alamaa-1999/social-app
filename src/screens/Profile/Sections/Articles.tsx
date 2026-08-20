import {useCallback, useEffect, useImperativeHandle, useMemo} from 'react'
import {type ListRenderItemInfo, View} from 'react-native'
import {moderatePost, type ModerationOpts} from '@bsky/sdk/moderation'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {useNavigation} from '@react-navigation/native'

import {useRequireStrikerForArticleAuthoring} from '#/lib/hooks/useRequireStrikerForArticleAuthoring'
import {type NavigationProp} from '#/lib/routes/types'
import {cleanError} from '#/lib/strings/errors'
import {useAuthorArticlesQuery} from '#/state/queries/articles'
import {PostFeedItem} from '#/view/com/posts/PostFeedItem'
import {EmptyState} from '#/view/com/util/EmptyState'
import {ErrorMessage} from '#/view/com/util/error/ErrorMessage'
import {List, type ListRef} from '#/view/com/util/List'
import {findListNativeTag} from '#/view/com/util/listNativeTag'
import {FeedLoadingPlaceholder} from '#/view/com/util/LoadingPlaceholder'
import {ios} from '#/alf'
import {Newspaper_Stroke2_Corner2_Rounded as NewspaperIcon} from '#/components/icons/Newspaper'
import {IS_IOS, IS_NATIVE} from '#/env'
import {type app} from '#/lexicons'
import {type SectionRef} from './types'

const LOADING = {_reactKey: 'loading'} as const
const EMPTY = {_reactKey: 'empty'} as const
const ERROR_ITEM = {_reactKey: 'error'} as const

type ArticleRow = {
  _reactKey?: undefined
  post: app.bsky.feed.defs.PostView
  moderation: ReturnType<typeof moderatePost>
}
type Row = typeof LOADING | typeof EMPTY | typeof ERROR_ITEM | ArticleRow

interface ArticlesSectionProps {
  ref?: React.Ref<SectionRef>
  did: string
  isMe: boolean
  moderationOpts: ModerationOpts
  scrollElRef: ListRef
  headerHeight: number
  isFocused: boolean
  setScrollViewTag: (tag: number | null) => void
}

/**
 * Lists an author's published articles - not as hand-built cards, but by
 * resolving each `site.standard.document`'s `bskyPostRef` to its real
 * companion post and rendering that through `PostFeedItem`, the same
 * per-row renderer `PostFeed` itself uses. This is what makes the free
 * `StandardSiteEmbed` card show up automatically (see
 * `useAuthorArticlesQuery`) - an earlier draft of this section rendered a
 * custom card directly from document fields, which was a corrected design
 * mistake (`articles client ui plan.md` Phase 3).
 */
export function ProfileArticlesSection({
  ref,
  did,
  isMe,
  moderationOpts,
  scrollElRef,
  headerHeight,
  isFocused,
  setScrollViewTag,
}: ArticlesSectionProps) {
  const {_} = useLingui()
  const navigation = useNavigation<NavigationProp>()
  const requireStriker = useRequireStrikerForArticleAuthoring()

  const {
    data: posts,
    isPending,
    isError,
    error,
    refetch,
  } = useAuthorArticlesQuery(did)

  const onScrollToTop = useCallback(() => {
    scrollElRef.current?.scrollToOffset({
      animated: IS_NATIVE,
      offset: -headerHeight,
    })
  }, [scrollElRef, headerHeight])

  useImperativeHandle(ref, () => ({
    scrollToTop: onScrollToTop,
  }))

  useEffect(() => {
    if (IS_IOS && isFocused && scrollElRef.current) {
      const nativeTag = findListNativeTag(scrollElRef.current)
      setScrollViewTag(nativeTag)
    }
  }, [isFocused, scrollElRef, setScrollViewTag])

  const items = useMemo(() => {
    if (isPending) return [LOADING]
    if (isError) return [ERROR_ITEM]
    const rows = (posts ?? [])
      .map(post => ({post, moderation: moderatePost(post, moderationOpts)}))
      .filter(row => !row.moderation.ui('contentList').filter)
    if (!rows.length) return [EMPTY]
    return rows
  }, [posts, isPending, isError, moderationOpts])

  const onPressWriteArticle = requireStriker(() =>
    navigation.navigate('ArticleCompose'),
  )

  const renderItem = useCallback(
    ({item, index}: ListRenderItemInfo<Row>) => {
      if (item._reactKey === 'loading') {
        return <FeedLoadingPlaceholder />
      }
      if (item._reactKey === 'error') {
        return (
          <ErrorMessage
            message={cleanError(error)}
            onPressTryAgain={() => void refetch()}
          />
        )
      }
      if (item._reactKey === 'empty') {
        return (
          <EmptyState
            icon={NewspaperIcon}
            message={
              isMe
                ? _(msg`You haven't written any articles yet`)
                : _(msg`No articles yet`)
            }
            button={
              isMe
                ? {
                    label: _(msg`Write an article`),
                    text: _(msg`Write an article`),
                    onPress: onPressWriteArticle,
                    size: 'small',
                    color: 'primary',
                  }
                : undefined
            }
          />
        )
      }
      return (
        <PostFeedItem
          post={item.post}
          record={item.post.record as app.bsky.feed.post.Main}
          moderation={item.moderation}
          parentAuthor={undefined}
          showReplyTo={false}
          reason={undefined}
          feedContext={''}
          reqId={undefined}
          rootPost={item.post}
          hideTopBorder={index === 0}
        />
      )
    },
    [_, error, refetch, isMe, onPressWriteArticle],
  )

  return (
    <View>
      <List
        ref={scrollElRef}
        data={items}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        headerOffset={headerHeight}
        progressViewOffset={ios(0)}
      />
    </View>
  )
}

function keyExtractor(item: Row) {
  if (
    item._reactKey === 'loading' ||
    item._reactKey === 'empty' ||
    item._reactKey === 'error'
  ) {
    return item._reactKey
  }
  return item.post.uri
}
