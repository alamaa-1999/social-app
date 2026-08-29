import {View} from 'react-native'
import {Trans, useLingui} from '@lingui/react/macro'

import {sanitizeDisplayName} from '#/lib/strings/display-names'
import {sanitizeHandle} from '#/lib/strings/handles'
import {UserAvatar} from '#/view/com/util/UserAvatar'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {ArrowShareRight_Stroke2_Corner2_Rounded as ShareIcon} from '#/components/icons/ArrowShareRight'
import * as Header from '#/components/Layout/Header'
import {Text} from '#/components/Typography'
import {ArticleImage} from './ArticleImage'
import {
  renderArticleDoc,
  type RenderArticleDocOptions,
} from './renderArticleDoc'

const CONTENT_MAX_WIDTH = 720

/**
 * A fixed editorial date format ("28 August 2026") for the article byline's
 * date row (Figma node 362:5435) - deliberately not `i18n.date()`, despite
 * that being this app's own standard elsewhere (`social-app/CLAUDE.md`).
 * `i18n.date()` re-localizes both the field order and the month-name length
 * to the reader's own active app language, which is exactly wrong here: the
 * owner asked for this exact rendering ("full month name, not summarised"),
 * not a locale-sensitive one - this app's own default English locale tag is
 * bare `'en'` (`locale/languages.ts`), and `Intl.DateTimeFormat('en', {day:
 * 'numeric', month: 'long', year: 'numeric'})` resolves to US month-first
 * ordering ("August 28, 2026"), confirmed directly rather than assumed.
 * `'en-GB'` is pinned explicitly to force day-month-year ordering regardless
 * of the reader's own language setting - a real, deliberate trade-off (the
 * month name itself will always render in English, never re-localized),
 * accepted because a fixed, non-localized date stamp is what was asked for.
 */
function formatArticleDate(date: Date) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

/**
 * The shared header + 720px content column both the public reader
 * (`Article/index.tsx`) and the pre-publish preview (inside `ArticleCompose`)
 * render through - grounded directly in Figma nodes 304:4819 ("Preview") and
 * 304:5172 ("Reader"), confirmed structurally and typographically identical
 * except that the Reader has no footer at all. Neither screen adds its own
 * footer here - that stays the caller's job, since only the preview has one.
 *
 * The header row itself is Figma's own standalone "Card header" component
 * (node 340:5307) - the back button and Follow button only belong to the
 * reader (previewing your own unpublished draft has no "back to the reader"
 * or "follow yourself" action), so `variant` picks which of those two render.
 * The "..." menu is present in both.
 */
export function ArticleView({
  variant,
  publicationName,
  publicationAvatar,
  handle,
  title,
  subtitle,
  authors,
  translators,
  date,
  coverImageSrc,
  doc,
  localImageUris,
  onPressLink,
}: {
  variant: 'reader' | 'preview'
  publicationName: string
  publicationAvatar?: string
  handle: string
  title: string
  subtitle?: string
  /**
   * Plain contributor names, not `site.standard.document.contributors`
   * (a separate, DID-based field this app's own compose UI deliberately
   * never populates - see `Metadata.tsx`'s own comment on why it's always
   * sent as `[]`). These come from `document.authors`/`document.translators`
   * instead, the TypeScript-only extension fields the "Article details"
   * screen actually writes to (`state/queries/articles.ts`'s `PublicArticle`
   * type has the full account). Only the first of each is shown, matching
   * Figma node 333:5247's own single-author/single-translator byline.
   */
  authors: string[]
  translators: string[]
  /**
   * `publishedAt` (or `updatedAt` when editing) - a real Date, already
   * resolved. Rendered in its own row (Figma node 362:5434/362:5435),
   * separate from the byline (333:5247) above it - not inline with the
   * contributor names the way it was before this screen's redesign.
   */
  date?: Date
  coverImageSrc?: string
  doc: Parameters<typeof renderArticleDoc>[0]
  localImageUris?: RenderArticleDocOptions['localImageUris']
  onPressLink?: RenderArticleDocOptions['onPressLink']
}) {
  const t = useTheme()
  const {t: l} = useLingui()
  const author = authors[0]
  const translator = translators[0]

  return (
    <>
      <View
        style={[
          a.w_full,
          a.border_b,
          t.atoms.bg,
          t.atoms.border_contrast_medium,
        ]}>
        <View
          style={[
            a.w_full,
            a.self_center,
            a.flex_row,
            a.align_center,
            a.gap_md,
            a.px_lg,
            a.py_md,
            {maxWidth: CONTENT_MAX_WIDTH},
          ]}>
          {variant === 'reader' ? <Header.BackButton /> : null}
          <View style={[a.flex_1, a.flex_row, a.align_start, a.gap_sm]}>
            <UserAvatar type="user" size={40} avatar={publicationAvatar} />
            <View style={[a.flex_1]}>
              <Text
                emoji
                numberOfLines={1}
                style={[
                  a.font_semi_bold,
                  t.atoms.text,
                  {fontSize: 14, lineHeight: 20},
                ]}>
                {sanitizeDisplayName(publicationName)}
              </Text>
              <Text
                numberOfLines={1}
                style={[
                  t.atoms.text_contrast_medium,
                  {fontSize: 14, lineHeight: 20},
                ]}>
                {sanitizeHandle(handle, '@')}
              </Text>
            </View>
          </View>
          {variant === 'reader' ? (
            <Button label={l`Follow`} color="primary" size="medium">
              <ButtonText>
                <Trans>Follow</Trans>
              </ButtonText>
            </Button>
          ) : null}
        </View>
      </View>

      <View
        style={[
          a.w_full,
          a.self_center,
          a.px_lg,
          a.pt_3xl,
          {maxWidth: CONTENT_MAX_WIDTH, paddingBottom: 78},
        ]}>
        <View style={[a.gap_sm, a.pb_md]}>
          <Text emoji style={[styles.title, t.atoms.text]}>
            {title}
          </Text>
          {subtitle ? (
            <Text emoji style={[styles.subtitle, t.atoms.text]}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {author || date ? (
          <View style={[a.gap_md, a.pb_lg]}>
            {author ? (
              <Text style={styles.byline}>
                {`By ${author}`}
                {translator ? `  •  Translated by ${translator}` : ''}
              </Text>
            ) : null}
            {date ? (
              <>
                {/*
                 * Figma node 362:5432 - a second divider, distinct from the
                 * 304:5128 one below the cover image - sitting between the
                 * byline and the date/share row specifically. A border
                 * always paints at the outer edge of its own box - combining
                 * `border_t` and `paddingVertical` on one View (as the
                 * 304:5128 divider below does) puts the line flush against
                 * whatever precedes it and pushes all the padding after it,
                 * not split evenly around it. Figma's own markup nests this
                 * as parent-padding-around-a-bare-bordered-child instead
                 * (`py-[4px]` wrapping a plain `h-px border-t` div) - matched
                 * here for real 4px-above/4px-below symmetry, since this
                 * divider sits inside a `gap_md`-spaced column where getting
                 * that split right actually shows.
                 */}
                <View style={a.py_xs}>
                  <View style={[a.border_t, t.atoms.border_contrast_medium]} />
                </View>
                <View style={[a.flex_row, a.align_center, a.justify_between]}>
                  <Text style={[styles.date, t.atoms.text_contrast_medium]}>
                    {formatArticleDate(date)}
                  </Text>
                  {/*
                   * Figma's own layer is literally named "REPLACE WITH ALF
                   * SCHEMA SHARE BUTTON" - a placeholder for a real icon
                   * from this app's own icon set, not a final asset to copy
                   * verbatim. `ArrowShareRight` is already this app's
                   * established share glyph (ProfileHeaderStandard, Drawer,
                   * ShareMenu, etc.). No share behavior is defined for
                   * articles yet, so non-interactive for now - same
                   * treatment as the header's Follow button.
                   */}
                  <ShareIcon
                    width={20}
                    fill={t.atoms.text_contrast_medium.color}
                  />
                </View>
              </>
            ) : null}
          </View>
        ) : null}
        {coverImageSrc ? (
          <View style={a.pb_lg}>
            <ArticleImage src={coverImageSrc} localImageUris={localImageUris} />
          </View>
        ) : null}
        {/*
         * Figma node 304:5128 - a fixed divider between the header block
         * (title/subtitle/byline/optional cover image) and the body, present
         * unconditionally rather than tied to the cover image's own
         * presence, kept separate from the outer `pb_lg` gap-after spacing.
         *
         * Previously built as one View combining `border_t` +
         * `paddingVertical: 4` + an explicit `height: 9` - the same
         * combined-element mistake the byline-to-date divider above already
         * had and got fixed for (see that divider's own comment): a border
         * always paints at the outer edge of its own box, so with no content
         * between top and bottom padding, all 8px of padding ends up
         * trailing after the line, none of it before. Fixed the same way -
         * `a.py_xs` (4px) wrapping a bare bordered child with no height of
         * its own, giving real 4px-above/4px-below symmetry instead of a
         * line flush against whatever precedes it.
         */}
        <View style={a.pb_lg}>
          <View style={a.py_xs}>
            <View style={[a.border_t, t.atoms.border_contrast_medium]} />
          </View>
        </View>
        {renderArticleDoc(doc, {
          localImageUris,
          onPressLink,
          colors: {text: t.atoms.text.color, link: t.atoms.text_link.color},
        })}
      </View>

      {/*
       * Figma node 364:164 - a reader-only closing call to action, below the
       * article body entirely. Preview has no equivalent (previewing your
       * own unpublished draft has nothing to "spread and share" yet) - same
       * `variant` gating as the header's back/Follow buttons above. Its own
       * divider reuses the identical parent-padding/bare-bordered-child
       * pattern as the two dividers above (see their own comments for why a
       * single combined border+padding element paints wrong).
       */}
      {variant === 'reader' ? (
        <View
          style={[
            a.w_full,
            a.self_center,
            a.px_lg,
            a.pt_lg,
            {maxWidth: CONTENT_MAX_WIDTH, paddingBottom: 100},
          ]}>
          <View style={[a.w_full, a.align_center, {gap: 21}]}>
            <View style={[a.w_full, a.py_xs]}>
              <View style={[a.border_t, t.atoms.border_contrast_medium]} />
            </View>
            <View
              style={[
                a.w_full,
                a.flex_row,
                a.flex_wrap,
                a.justify_between,
                a.align_center,
              ]}>
              <View style={[a.gap_md, {maxWidth: 370}]}>
                <Text style={styles.ctaHeading}>
                  <Trans>Spread and share the goodness</Trans>
                </Text>
                {/*
                 * The honorific ("ﷺ", U+FDFA) is pinned to Scheherazade New
                 * explicitly rather than inheriting the surrounding
                 * Vollkorn - the exact bug this session's own article-body
                 * honorific fix addressed (`renderArticleDoc.tsx`'s
                 * `styles.honorific`): Vollkorn has no glyph for this
                 * character, so left unstyled the browser would silently
                 * substitute its own fallback for just that one glyph.
                 */}
                <Text style={styles.ctaQuote}>
                  <Trans>
                    The Prophet (<Text style={styles.ctaHonorific}>ﷺ</Text>
                    )“Whoever guides to a good affair has the same reward as the
                    one who performs it.”
                  </Trans>
                </Text>
                <Text
                  style={[styles.ctaAttribution, t.atoms.text_contrast_medium]}>
                  <Trans>— Sahīh Muslim</Trans>
                </Text>
              </View>
              {/*
               * Figma's own layer is literally named "REPLACE WITH ALF
               * SCHEMA SHARE BUTTON", the same placeholder pattern as the
               * date row's share icon above - non-interactive for now,
               * since no share behavior exists for articles yet.
               */}
              <View
                style={[
                  a.align_center,
                  a.justify_center,
                  t.atoms.border_contrast_low,
                  {
                    width: 67,
                    height: 67,
                    padding: 18,
                    borderRadius: 99,
                    borderWidth: 1,
                  },
                ]}>
                <ShareIcon
                  width={24}
                  fill={t.atoms.text_contrast_medium.color}
                />
              </View>
            </View>
          </View>
        </View>
      ) : null}
    </>
  )
}

const styles = {
  title: {
    fontFamily: 'Fraunces SemiBold',
    fontSize: 32,
    lineHeight: 32 * 1.4,
  },
  subtitle: {
    fontFamily: 'Fraunces Regular',
    fontWeight: '400' as const,
    fontSize: 20,
    lineHeight: 20 * 1.4,
  },
  byline: {
    fontFamily: 'Archivo Regular',
    fontSize: 14,
    lineHeight: 14 * 1.25,
    color: '#a2845e',
  },
  date: {
    fontFamily: 'Vollkorn SC',
    fontSize: 18,
    lineHeight: 18 * 1.25,
    letterSpacing: 1.4,
  },
  ctaHeading: {
    fontFamily: 'Vollkorn SC',
    fontSize: 18,
    lineHeight: 22.5,
    letterSpacing: 1.8,
    color: '#a2845e',
  },
  ctaQuote: {
    fontFamily: 'Vollkorn',
    fontStyle: 'italic' as const,
    fontSize: 18,
    lineHeight: 26.1,
  },
  ctaHonorific: {
    fontFamily: 'Scheherazade New',
  },
  ctaAttribution: {
    fontFamily: 'Vollkorn SC',
    fontSize: 14,
    lineHeight: 17.5,
    letterSpacing: 1.4,
  },
}
