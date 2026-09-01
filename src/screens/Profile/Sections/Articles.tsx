import {useCallback, useEffect, useImperativeHandle, useMemo} from 'react'
import {type ListRenderItemInfo, View} from 'react-native'
import {type UriString} from '@atproto/lex'
import {AtUri} from '@atproto/syntax'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'
import {useNavigation} from '@react-navigation/native'

import {resolveArticleShareLink} from '#/lib/api/article-share'
import {SUNNAHSKY_SERVICE} from '#/lib/constants'
import {useOpenComposer} from '#/lib/hooks/useOpenComposer'
import {useRequireStrikerForArticleAuthoring} from '#/lib/hooks/useRequireStrikerForArticleAuthoring'
import {type NavigationProp} from '#/lib/routes/types'
import {cleanError} from '#/lib/strings/errors'
import {logger} from '#/logger'
import {
  type AuthorArticle,
  useAuthorArticlesQuery,
  useDeleteArticleMutation,
} from '#/state/queries/articles'
import {EmptyState} from '#/view/com/util/EmptyState'
import {ErrorMessage} from '#/view/com/util/error/ErrorMessage'
import {List, type ListRef} from '#/view/com/util/List'
import {findListNativeTag} from '#/view/com/util/listNativeTag'
import {FeedLoadingPlaceholder} from '#/view/com/util/LoadingPlaceholder'
import {atoms as a, ios} from '#/alf'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import {ArrowOutOfBoxModified_Stroke2_Corner2_Rounded as ShareIcon} from '#/components/icons/ArrowOutOfBox'
import {DotGrid3x1_Stroke2_Corner0_Rounded as DotGridIcon} from '#/components/icons/DotGrid'
import {Newspaper_Stroke2_Corner2_Rounded as NewspaperIcon} from '#/components/icons/Newspaper'
import {PencilLine_Stroke2_Corner0_Rounded as PencilLineIcon} from '#/components/icons/Pencil'
import {Trash_Stroke2_Corner0_Rounded as TrashIcon} from '#/components/icons/Trash'
import * as Menu from '#/components/Menu'
import {StandardSiteEmbed} from '#/components/Post/Embed/StandardSiteEmbed'
import * as Prompt from '#/components/Prompt'
import * as Toast from '#/components/Toast'
import {IS_IOS, IS_NATIVE} from '#/env'
import {type app} from '#/lexicons'
import {type SectionRef} from './types'

const LOADING = {_reactKey: 'loading'} as const
const EMPTY = {_reactKey: 'empty'} as const
const ERROR_ITEM = {_reactKey: 'error'} as const

type ArticleRow = {
  _reactKey?: undefined
  article: AuthorArticle
  view: app.bsky.embed.external.ViewExternal
}
type Row = typeof LOADING | typeof EMPTY | typeof ERROR_ITEM | ArticleRow

interface ArticlesSectionProps {
  ref?: React.Ref<SectionRef>
  did: string
  isMe: boolean
  profile: app.bsky.actor.defs.ProfileViewDetailed
  scrollElRef: ListRef
  headerHeight: number
  isFocused: boolean
  setScrollViewTag: (tag: number | null) => void
}

/**
 * Builds the same `ViewExternal` shape the AppView would otherwise hydrate
 * for this document's companion post, straight from PDS-sourced fields -
 * see `useAuthorArticlesQuery`'s own doc comment for why this tab no longer
 * resolves through the AppView at all. `associatedRefs` carries only the
 * document's own ref (not the publication's) - `StandardSiteEmbed`'s
 * `isStandardSitePublicationEmbed` check only cares that a
 * `site.standard.document` ref is present, not that every possible ref is.
 */
function articleToViewExternal(
  article: AuthorArticle,
  profile: app.bsky.actor.defs.ProfileViewDetailed,
): app.bsky.embed.external.ViewExternal | undefined {
  const {doc, uri, cid} = article
  if (!doc.path) return undefined
  const coverImage = doc.coverImage
  const thumb = coverImage
    ? (`${SUNNAHSKY_SERVICE}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(
        profile.did,
      )}&cid=${encodeURIComponent(
        'ref' in coverImage ? coverImage.ref.toString() : coverImage.cid,
      )}` as UriString)
    : undefined
  return {
    $type: 'app.bsky.embed.external#viewExternal',
    uri: `${SUNNAHSKY_SERVICE}${doc.path}`,
    title: doc.title,
    description: doc.description ?? '',
    thumb,
    createdAt: doc.publishedAt,
    updatedAt: doc.updatedAt,
    associatedRefs: [{uri, cid}],
    associatedProfiles: [
      {
        $type: 'app.bsky.actor.defs#profileViewBasic',
        did: profile.did,
        handle: profile.handle,
        displayName: profile.displayName,
        avatar: profile.avatar,
      },
    ],
  }
}

/**
 * Overflow menu for a single article row. Rendered as a sibling overlay on
 * top of `StandardSiteEmbed` (never inside it - that component is shared
 * everywhere articles render and must not gain this logic, and it already
 * wraps its whole card in its own tap-to-navigate `Link`, so this needs to
 * sit visually above that rather than nest inside it).
 *
 * Share is available for every article, own or another account's - it must
 * never be gated on `isMe`, since cross-author sharing is the whole point.
 * Edit and Delete stay own-articles-only.
 */
function ArticleRowMenu({
  article,
  isMe,
}: {
  article: AuthorArticle
  isMe: boolean
}) {
  const {_} = useLingui()
  const navigation = useNavigation<NavigationProp>()
  const requireStriker = useRequireStrikerForArticleAuthoring()
  const {openComposer} = useOpenComposer()
  const {mutateAsync: deleteArticleMutate} = useDeleteArticleMutation()
  const deletePromptControl = Prompt.usePromptControl()

  const documentRkey = new AtUri(article.uri).rkey

  const onPressEdit = requireStriker(() =>
    navigation.navigate('ArticleEdit', {rkey: documentRkey}),
  )

  const onPressShare = () => {
    openComposer(
      async () => ({
        presetExternalLink: await resolveArticleShareLink(article.uri),
        text: article.doc.title,
        logContext: 'ArticleShare',
      }),
      {},
    )
  }

  const onConfirmDelete = async () => {
    try {
      await deleteArticleMutate({documentUri: article.uri, documentRkey})
      Toast.show(_(msg({message: 'Article deleted', context: 'toast'})))
    } catch (e) {
      logger.error('Failed to delete article', {message: e})
      Toast.show(_(msg`Failed to delete article, please try again`), {
        type: 'error',
      })
    }
  }

  return (
    <>
      <Menu.Root>
        <Menu.Trigger label={_(msg`Article options`)}>
          {({props}) => (
            <Button
              label={props.accessibilityLabel}
              testID="articleOptionsBtn"
              size="small"
              color="secondary"
              shape="round"
              {...props}>
              <ButtonIcon icon={DotGridIcon} />
            </Button>
          )}
        </Menu.Trigger>
        <Menu.Outer showCancel>
          <Menu.Group>
            <Menu.Item label={_(msg`Share`)} onPress={onPressShare}>
              <Menu.ItemText>
                <Trans>Share</Trans>
              </Menu.ItemText>
              <Menu.ItemIcon position="right" icon={ShareIcon} />
            </Menu.Item>
          </Menu.Group>
          {isMe && (
            <>
              <Menu.Divider />
              <Menu.Group>
                <Menu.Item label={_(msg`Edit article`)} onPress={onPressEdit}>
                  <Menu.ItemText>
                    <Trans>Edit article</Trans>
                  </Menu.ItemText>
                  <Menu.ItemIcon position="right" icon={PencilLineIcon} />
                </Menu.Item>
                <Menu.Item
                  label={_(msg`Delete article`)}
                  onPress={() => deletePromptControl.open()}>
                  <Menu.ItemText>
                    <Trans>Delete article</Trans>
                  </Menu.ItemText>
                  <Menu.ItemIcon position="right" icon={TrashIcon} />
                </Menu.Item>
              </Menu.Group>
            </>
          )}
        </Menu.Outer>
      </Menu.Root>
      <Prompt.Basic
        control={deletePromptControl}
        title={_(msg`Delete this article?`)}
        description={_(
          msg`If you delete this article, you won't be able to recover it.`,
        )}
        onConfirm={() => void onConfirmDelete()}
        confirmButtonCta={_(msg`Delete`)}
        confirmButtonColor="negative"
      />
    </>
  )
}

/**
 * Lists an author's published articles, each rendered as a `StandardSiteEmbed`
 * card built directly from the document's own fields - see
 * `useAuthorArticlesQuery`'s doc comment for why this no longer resolves
 * through a real companion post. A document with no usable `path` (a loose
 * document from a third-party Standard.site client, or one predating this
 * field) is skipped rather than shown with a broken link - rare in practice,
 * since this app's own `publishArticle()` always sets it.
 */
export function ProfileArticlesSection({
  ref,
  did,
  isMe,
  profile,
  scrollElRef,
  headerHeight,
  isFocused,
  setScrollViewTag,
}: ArticlesSectionProps) {
  const {_} = useLingui()
  const navigation = useNavigation<NavigationProp>()
  const requireStriker = useRequireStrikerForArticleAuthoring()

  const {
    data: articles,
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
    const rows = (articles ?? []).flatMap(article => {
      const view = articleToViewExternal(article, profile)
      if (!view) return []
      return [{article, view}]
    })
    if (!rows.length) return [EMPTY]
    return rows
  }, [articles, isPending, isError, profile])

  const onPressWriteArticle = requireStriker(() =>
    navigation.navigate('ArticleCompose'),
  )

  // Permanent, always visible - distinct from the empty-state "Write an
  // article" button below, which disappears the moment the account has
  // published its first article. Same gating as that one: visible for any
  // isMe viewer regardless of role, with `onPressWriteArticle` (already
  // wrapped in `requireStriker`) handling the Striker-only block on press.
  const listHeader = useMemo(() => {
    if (!isMe) return null
    return (
      <View style={[a.px_lg, a.py_md, a.align_start]}>
        <Button
          label={_(msg`Write an article`)}
          size="small"
          color="primary"
          onPress={onPressWriteArticle}>
          <ButtonText>
            <Trans>Write an article</Trans>
          </ButtonText>
        </Button>
      </View>
    )
  }, [isMe, _, onPressWriteArticle])

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
          />
        )
      }
      return (
        <View style={[a.px_lg, a.pb_md, index === 0 && a.pt_md]}>
          <View style={[a.relative]}>
            <StandardSiteEmbed view={item.view} />
            <View
              style={[
                a.absolute,
                a.z_10,
                {top: a.p_sm.padding, right: a.p_sm.padding},
              ]}>
              <ArticleRowMenu article={item.article} isMe={isMe} />
            </View>
          </View>
        </View>
      )
    },
    [_, error, refetch, isMe],
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
        ListHeaderComponent={listHeader}
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
  return item.article.uri
}
