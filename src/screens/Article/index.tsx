import {useMemo} from 'react'
import {ScrollView, View} from 'react-native'
import {useSafeAreaInsets} from 'react-native-safe-area-context'
import {Trans} from '@lingui/react/macro'
import {useNavigation} from '@react-navigation/native'

import {useOpenLink} from '#/lib/hooks/useOpenLink'
import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
  type NavigationProp,
} from '#/lib/routes/types'
import {usePublicArticleQuery} from '#/state/queries/articles'
import {useSession} from '#/state/session'
import {draftFacetsToEditorFacets} from '#/screens/ArticleCompose/drafts/state/api'
import {manager} from '#/screens/ArticleCompose/editor-web/manager'
import {applyFacetsToParsedDoc} from '#/screens/ArticleCompose/editor-web/serializer'
import {parseDocumentContent} from '#/screens/ArticleCompose/loadedArticle'
import {atoms as a, useTheme} from '#/alf'
import * as Header from '#/components/Layout/Header'
import {Loader} from '#/components/Loader'
import {Portal} from '#/components/Portal'
import {Text} from '#/components/Typography'
import {type com} from '#/lexicons'
import {ArticleView} from './ArticleView'

type Props = NativeStackScreenProps<CommonNavigatorParams, 'Article'>

/**
 * The public article reader. Reached either by tapping an existing
 * `StandardSiteEmbed` card (via `isSunnahskyArticleUrl`'s link interception,
 * see `url-helpers.ts`) or by a direct `/article/:did/:rkey` link - never
 * through a companion post, since one isn't guaranteed to exist (see
 * `usePublicArticleQuery`'s own doc comment).
 *
 * Structurally identical to the pre-publish preview inside `ArticleCompose`
 * (`ArticleView` is the shared piece) except that this screen has no footer
 * at all - confirmed directly against Figma's own dedicated "Reader" node,
 * not assumed from the "Preview" node alone.
 *
 * Deliberately does NOT use `Layout.Screen`/`Layout.Content` - both are
 * documented (`components/Layout/README.md`) as constraining web content to
 * a fixed, bordered 600px center column, the app-wide convention for feed/
 * profile/thread-style screens. Figma specifies this screen as a genuine
 * full-bleed reading surface (a full-width white background, with only the
 * *content* itself, via `ArticleView`'s own 720px cap, centered inside it) -
 * using the standard column chrome here would render it as a narrow card on
 * a wide viewport, which is exactly the "modal window" look this screen
 * must not have.
 *
 * Also, and separately, wrapped in a `Portal` + `a.fixed`/`a.inset_0` shell -
 * the same mechanism `ArticleCompose`'s own preview already uses (see its
 * `previewSnapshot` branch). This is a different problem than the column
 * width above: on web, `createNativeStackNavigatorWithAuth.tsx` renders
 * `DesktopLeftNav`/`DesktopRightNav` unconditionally as siblings of every
 * screen in the `Flat` navigator - there is no per-route opt-out at that
 * layer, so without this a screen still sits in normal flow next to the
 * sidebars no matter how its own content is styled. `position: fixed` paints
 * over them regardless of that stacking context, matching the owner's own
 * decision that the reader is a standalone page, not one that lives inside
 * the app's nav shell.
 */
export function ArticleScreen({route}: Props) {
  const {did, rkey} = route.params
  const t = useTheme()
  const {top} = useSafeAreaInsets()
  const openLink = useOpenLink()
  const navigation = useNavigation<NavigationProp>()
  const {currentAccount} = useSession()
  const {data, isPending, isError} = usePublicArticleQuery(did, rkey)

  /*
   * `did` here is the route param the reader already loads by, never a
   * value read off any post/ref - same identity discipline `ArticleEdit`
   * itself already applies (see `PostMenuItems.tsx`'s former equivalent
   * comment, before that entry point was removed in favor of this one and
   * the Articles-tab menu).
   */
  const isOwnArticle = !!currentAccount && currentAccount.did === did

  const doc = useMemo(() => {
    if (!data) return undefined
    const content = parseDocumentContent(data.document.content)
    if (!content) return undefined
    /*
     * `content.facets` is the raw wire-format array read straight off the
     * record (`{$type, index, features: [...]}`, plural) - `EditorFacet`'s
     * own shape is `{feature: {$type, ...}, ...}`, singular, and
     * `applyFacetsToParsedDoc` reads `.feature.$type` directly. A bare cast
     * here previously skipped that conversion entirely, so every real
     * article with a facet on it (confirmed live: an `arabicQuote` block
     * facet) crashed with "Cannot read properties of undefined (reading
     * '$type')" the moment the reader tried to render it - unit tests never
     * caught this because `renderArticleDoc.test.tsx`'s fixtures construct
     * `EditorFacet[]` by hand, already in the post-conversion shape.
     * `draftFacetsToEditorFacets` is the exact inverse of `facetsToWireFormat`
     * the composer's own edit-load path (`loadedArticle.ts`) already calls
     * for this same wire shape - reused here rather than re-solved.
     */
    return applyFacetsToParsedDoc(
      manager,
      content.markdown,
      draftFacetsToEditorFacets(
        content.facets as unknown as com.sunnahsky.article.draft.defs.Draft['facets'],
      ),
    ).doc
  }, [data])

  /*
   * Reused across the loading/error branches below - once `data` loads,
   * `ArticleView`'s own header (Figma node 340:5307, "Card header") takes
   * over and renders `Header.BackButton` inline itself (`variant="reader"`),
   * so this standalone strip is only ever needed before that point.
   */
  const backButtonStrip = (
    <View style={[a.flex_row, a.align_center, a.px_sm, {minHeight: 44}]}>
      <Header.BackButton />
    </View>
  )

  return (
    <Portal>
      <View style={[a.fixed, a.inset_0, t.atoms.bg]}>
        <View
          testID="articleScreen"
          style={[a.flex_1, t.atoms.bg, {paddingTop: top}]}>
          {isPending ? (
            <>
              {backButtonStrip}
              <View
                style={[a.flex_1, a.align_center, a.justify_center, a.py_5xl]}>
                <Loader size="lg" />
              </View>
            </>
          ) : isError || !data || !doc ? (
            <>
              {backButtonStrip}
              <View
                style={[a.flex_1, a.align_center, a.justify_center, a.p_xl]}>
                <Text style={[a.text_md, t.atoms.text_contrast_medium]}>
                  <Trans>This article could not be found.</Trans>
                </Text>
              </View>
            </>
          ) : (
            <ScrollView
              style={[a.flex_1]}
              contentContainerStyle={[a.align_center]}>
              <ArticleView
                variant="reader"
                isOwnArticle={isOwnArticle}
                onPressEdit={() => navigation.navigate('ArticleEdit', {rkey})}
                publicationName={data.publicationName}
                publicationAvatar={data.publicationAvatarUri}
                handle={data.handle}
                title={data.document.title}
                subtitle={data.document.description}
                authors={data.authors}
                translators={data.translators}
                date={
                  data.document.updatedAt
                    ? new Date(data.document.updatedAt)
                    : new Date(data.document.publishedAt)
                }
                coverImageSrc={data.coverImageSrc}
                doc={doc}
                onPressLink={href => openLink(href)}
              />
            </ScrollView>
          )}
        </View>
      </View>
    </Portal>
  )
}
