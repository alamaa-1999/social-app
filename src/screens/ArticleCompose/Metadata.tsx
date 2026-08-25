import {useState} from 'react'
import {Image, Pressable, TextInput, View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {useOwnArticleMetadataHistoryQuery} from '#/state/queries/articles'
import {EventStopper} from '#/view/com/util/EventStopper'
import {atoms as a, useBreakpoints, useTheme, web} from '#/alf'
import * as Toggle from '#/components/forms/Toggle'
import {Attachment01 as AttachmentIcon} from '#/components/icons/Attachment01'
import {CheckThick_Stroke2_Corner0_Rounded as CheckIcon} from '#/components/icons/Check'
import {ChevronDown_Small as ChevronDownIcon} from '#/components/icons/ChevronDownSmall'
import {MagnifyingGlass_Stroke2_Corner0_Rounded as SearchIcon} from '#/components/icons/MagnifyingGlass'
import {Photo_Stroke2_Corner0_Rounded as PhotoIcon} from '#/components/icons/Photo'
import {TimesLarge_Stroke2_Corner0_Rounded as XIcon} from '#/components/icons/Times'
import {Trash_Stroke2_Corner0_Rounded as TrashIcon} from '#/components/icons/Trash'
import * as Menu from '#/components/Menu'
import {Text} from '#/components/Typography'

export interface MetadataValue {
  authors: string[]
  translators: string[]
  categories: string[]
  tags: string[]
}

/**
 * A checkbox-list row, styled to the exact spec from the Author/Translator/
 * Category popover frames (nodes 153:1170/153:918/58:5288, file
 * pxYtWNgjV2VOLMGYr0ujlL) rather than `Toggle.Checkbox`'s generic 24px/
 * `contrast_100` look, which doesn't match. Reads selection state via
 * `Toggle.useItemContext()` - the same pattern this codebase already uses
 * for custom `Toggle.Item` visuals (see `InterestButton` in
 * `InterestsSettings.tsx`).
 */
function MetadataCheckboxRow({label}: {label: string}) {
  const t = useTheme()
  const {selected} = Toggle.useItemContext()
  return (
    <View style={[{paddingHorizontal: 6, paddingVertical: 1}, a.w_full]}>
      <View
        style={[
          a.flex_row,
          a.align_center,
          {
            gap: 8,
            paddingLeft: 10,
            paddingRight: 6,
            paddingVertical: 8,
            borderRadius: 6,
          },
        ]}>
        <View
          style={[
            a.align_center,
            a.justify_center,
            {width: 16, height: 16, borderRadius: 4},
            selected
              ? {backgroundColor: t.palette.primary_500}
              : [a.border, t.atoms.border_contrast_low],
          ]}>
          {selected && (
            <CheckIcon width={10} style={[{color: t.palette.white}]} />
          )}
        </View>
        <Text
          style={[
            a.text_sm,
            a.font_bold,
            {lineHeight: 20},
            t.atoms.text_contrast_high,
          ]}
          numberOfLines={1}>
          {label}
        </Text>
      </View>
    </View>
  )
}

function RemovableChip({
  label,
  onRemove,
}: {
  label: string
  onRemove: () => void
}) {
  const t = useTheme()
  const {_} = useLingui()
  return (
    <View
      style={[
        a.flex_row,
        a.align_center,
        {height: 28, paddingLeft: 10, paddingRight: 4, gap: 3},
        a.border,
        t.atoms.border_contrast_low,
        {borderRadius: 6},
      ]}>
      <Text
        style={[
          a.text_sm,
          a.font_medium,
          {lineHeight: 20},
          t.atoms.text_contrast_medium,
        ]}>
        {label}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={_(msg`Remove ${label}`)}
        accessibilityHint=""
        onPress={onRemove}
        hitSlop={8}
        style={[a.align_center, a.justify_center, {padding: 3}]}>
        <XIcon width={14} style={[t.atoms.text_contrast_low]} />
      </Pressable>
    </View>
  )
}

/**
 * Chevron-chip on desktop, full-width chevron row on mobile - the trigger
 * shape confirmed distinct between the two breakpoints in the fetched Figma
 * frames.
 *
 * `prefix`/`suffix` (e.g. "Category: " / " +3") are rendered as
 * non-shrinking text either side of the truncatable `label` - if the whole
 * "prefix + label + suffix" string were truncated as one block, a long name
 * would eat the trailing "+N" count entirely (it's the last thing in the
 * string, so it's the first thing an ellipsis cuts). Only `label` shrinks
 * and truncates within the 180px cap; the count badge always stays visible.
 */
function MenuTrigger({
  prefix,
  label,
  suffix,
  fullWidth,
  triggerProps,
}: {
  prefix?: string
  label: string
  suffix?: string
  fullWidth: boolean
  triggerProps: object
}) {
  const t = useTheme()
  return (
    <Pressable
      {...triggerProps}
      style={
        fullWidth
          ? [
              a.w_full,
              a.flex_row,
              a.align_center,
              a.justify_between,
              {gap: 8, paddingVertical: 8},
            ]
          : [a.flex_row, a.align_center, {gap: 8}]
      }>
      <View style={[a.flex_row, a.align_center, {maxWidth: 180}]}>
        {prefix && (
          <Text
            style={[
              a.text_sm,
              {lineHeight: 16, flexShrink: 0},
              t.atoms.text_contrast_medium,
            ]}>
            {prefix}
          </Text>
        )}
        <Text
          style={[
            a.text_sm,
            {lineHeight: 16, flexShrink: 1, minWidth: 0},
            t.atoms.text_contrast_medium,
          ]}
          numberOfLines={1}
          ellipsizeMode="tail">
          {label}
        </Text>
        {suffix && (
          <Text
            style={[
              a.text_sm,
              {lineHeight: 16, flexShrink: 0},
              t.atoms.text_contrast_medium,
            ]}>
            {suffix}
          </Text>
        )}
      </View>
      <ChevronDownIcon style={[t.atoms.text_contrast_low]} width={16} />
    </Pressable>
  )
}

/**
 * Shared Author/Translator/Category popover body - rebuilt against the real
 * fetched Figma reference (nodes 153:1170/153:918/58:5288): a top search box
 * that only filters the checkbox list below it, and a SEPARATE "type a new
 * name, hit enter to add it" field at the bottom with no add button (the
 * instruction text + Enter key are the only affordance Figma shows - an
 * earlier pass wrongly merged these into one field with a button). Both
 * fields reuse the real `TextField` component (this app's own documented
 * source of truth for this exact popover's input chrome, per the Figma
 * node's own component description) rather than a hand-rolled input.
 *
 * The checkbox list combines the account's own history
 * (`useOwnArticleMetadataHistoryQuery`) with whatever's currently selected,
 * so a just-typed custom value still has a checkbox to toggle. Per the
 * project owner's correction, this is NOT an account picker - each
 * Striker's list is private and starts empty.
 *
 * `EventStopper` guards keystrokes in both fields from Radix's dropdown
 * roving-focus (`Select/index.web.tsx`'s established precedent).
 */
function MetadataSearchPicker({
  triggerPrefix,
  triggerLabel,
  triggerSuffix,
  ariaLabel,
  searchPlaceholder,
  addInstruction,
  addPlaceholder,
  selected,
  suggestions,
  onChange,
  fullWidth,
}: {
  triggerPrefix?: string
  triggerLabel: string
  triggerSuffix?: string
  ariaLabel: string
  searchPlaceholder: string
  addInstruction: string
  addPlaceholder: string
  selected: string[]
  suggestions: string[]
  onChange: (next: string[]) => void
  fullWidth: boolean
}) {
  const t = useTheme()
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState('')

  const allKnownValues = [...new Set([...suggestions, ...selected])]
  const trimmedQuery = query.trim()
  const filtered = trimmedQuery
    ? allKnownValues.filter(v =>
        v.toLowerCase().includes(trimmedQuery.toLowerCase()),
      )
    : allKnownValues

  const addNew = () => {
    const trimmed = draft.trim()
    if (!trimmed || selected.includes(trimmed)) return
    onChange([...selected, trimmed])
    setDraft('')
  }

  return (
    <Menu.Root>
      <Menu.Trigger label={ariaLabel}>
        {({props}) => (
          <MenuTrigger
            prefix={triggerPrefix}
            label={triggerLabel}
            suffix={triggerSuffix}
            fullWidth={fullWidth}
            triggerProps={props}
          />
        )}
      </Menu.Trigger>
      {/* padding: 0 overrides Menu.Outer's own default 4px shell padding
      (a.p_xs) - this popover builds its own complete header/list/footer
      padding matching Figma's spec exactly, so the shared component's
      default padding is pure surplus that pushes everything inward. */}
      <Menu.Outer style={[{width: 308, padding: 0}]}>
        <EventStopper
          style={[{padding: 12}, a.border_b, t.atoms.border_contrast_low]}>
          {/* Hand-built, not TextField.Root/Input - this specific box's
          default (non-focused) state is plain white/bordered per the
          fetched reference, not TextField's own default `bg_contrast_50`/
          transparent-border look, and TextField's stacked Root+Input
          padding (16px horizontal, 11px vertical + a 2px web margin)
          doesn't match this box's literal 12px/8px spec either. */}
          <View
            style={[
              a.flex_row,
              a.align_center,
              {gap: 8, paddingLeft: 12, paddingRight: 8, paddingVertical: 8},
              a.border,
              t.atoms.border_contrast_low,
              {borderRadius: 8},
              t.atoms.bg,
            ]}>
            <SearchIcon width={16} style={[t.atoms.text_contrast_low]} />
            <TextInput
              accessibilityLabel={searchPlaceholder}
              accessibilityHint=""
              value={query}
              onChangeText={setQuery}
              placeholder={searchPlaceholder}
              placeholderTextColor={t.palette.contrast_500}
              style={[a.flex_1, a.text_sm, {lineHeight: 20}, t.atoms.text]}
            />
          </View>
        </EventStopper>
        <View
          style={[
            {paddingVertical: 4, maxHeight: 220},
            web({overflowY: 'auto'}),
          ]}>
          {filtered.length === 0 ? (
            <Text
              style={[
                a.text_sm,
                {lineHeight: 16},
                t.atoms.text_contrast_medium,
                {paddingHorizontal: 16, paddingVertical: 8},
              ]}>
              <Trans>No matches yet - type a new one below.</Trans>
            </Text>
          ) : (
            <Toggle.Group
              type="checkbox"
              values={selected}
              onChange={onChange}
              label={ariaLabel}>
              {filtered.map(value => (
                <Toggle.Item key={value} name={value} label={value}>
                  <MetadataCheckboxRow label={value} />
                </Toggle.Item>
              ))}
            </Toggle.Group>
          )}
        </View>
        <EventStopper
          style={[
            {padding: 12},
            a.border_t,
            t.atoms.border_contrast_low,
            {gap: 8},
          ]}>
          <Text
            style={[
              a.text_sm,
              a.font_medium,
              {lineHeight: 16},
              t.atoms.text_contrast_medium,
            ]}>
            {addInstruction}
          </Text>
          {/* Hand-built "Chrome" input, matching the literal Figma spec
          exactly (12px horizontal / 11px padding, no margin) rather than
          TextField.Root/Input's own stacked padding - see the doc comment
          on the search box above for why. */}
          <TextInput
            accessibilityLabel={addPlaceholder}
            accessibilityHint=""
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={addNew}
            placeholder={addPlaceholder}
            placeholderTextColor={t.palette.contrast_500}
            style={[
              {
                paddingHorizontal: 12,
                paddingVertical: 11,
                borderRadius: 10,
                backgroundColor: t.palette.primary_25,
                borderWidth: 1,
                borderColor: t.palette.primary_500,
                fontSize: 15,
              },
              t.atoms.text,
            ]}
          />
        </EventStopper>
      </Menu.Outer>
    </Menu.Root>
  )
}

/** Tags popover body: no search/history, just a free-text add field and a wrapping row of removable chips - matches `ArticleDraft.tags: string[]` directly. */
function TagsPicker({
  triggerLabel,
  ariaLabel,
  tags,
  onChange,
  fullWidth,
}: {
  triggerLabel: string
  ariaLabel: string
  tags: string[]
  onChange: (next: string[]) => void
  fullWidth: boolean
}) {
  const {_} = useLingui()
  const t = useTheme()
  const [draft, setDraft] = useState('')

  const addTag = () => {
    const trimmed = draft.trim()
    if (!trimmed || tags.includes(trimmed)) return
    onChange([...tags, trimmed])
    setDraft('')
  }
  const removeTag = (tag: string) => onChange(tags.filter(x => x !== tag))

  return (
    <Menu.Root>
      <Menu.Trigger label={ariaLabel}>
        {({props}) => (
          <MenuTrigger
            label={triggerLabel}
            fullWidth={fullWidth}
            triggerProps={props}
          />
        )}
      </Menu.Trigger>
      {/* padding: 0 overrides Menu.Outer's own default 4px shell padding
      (a.p_xs) - this popover builds its own complete header/chip-cloud
      padding matching Figma's spec exactly, so the shared component's
      default padding is pure surplus that pushes everything inward. */}
      <Menu.Outer style={[{width: 308, padding: 0}]}>
        <EventStopper
          style={[
            {padding: 12, gap: 8},
            a.border_b,
            t.atoms.border_contrast_low,
          ]}>
          <Text
            style={[
              a.text_sm,
              a.font_medium,
              {lineHeight: 16},
              t.atoms.text_contrast_medium,
            ]}>
            <Trans>Type a tag, and hit enter to add it.</Trans>
          </Text>
          {/* Hand-built, not TextField.Root/Input - that shared component
          bakes in its own padding (px_md on Root + px_xs on Input = 16px
          horizontal, plus a 2px web-only margin on top of its 11px vertical
          padding) that doesn't match this exact "Chrome" spec (12px
          horizontal, 11px vertical, no margin) from the fetched reference.
          The always-blue focused-looking chrome is deliberate, confirmed
          against three other identical "type new value" fields this same
          session (Author/Translator/Category), not a stray focus-state
          capture. */}
          <TextInput
            accessibilityLabel={_(msg`Type here...`)}
            accessibilityHint=""
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={addTag}
            placeholder={_(msg`Type here...`)}
            placeholderTextColor={t.palette.contrast_500}
            style={[
              {
                paddingHorizontal: 12,
                paddingVertical: 11,
                borderRadius: 10,
                backgroundColor: t.palette.primary_25,
                borderWidth: 1,
                borderColor: t.palette.primary_500,
                fontSize: 15,
              },
              t.atoms.text,
            ]}
          />
        </EventStopper>
        {/* Always rendered, chips or the empty-state message - an earlier
        version omitted this whole section when `tags` was empty instead of
        showing Figma's "No tags defined yet." state (node 189:2811). */}
        <EventStopper
          style={[
            a.flex_row,
            a.flex_wrap,
            {
              gap: 8,
              paddingTop: 12,
              paddingBottom: 18,
              paddingHorizontal: 12,
            },
          ]}>
          {tags.length === 0 ? (
            <Text
              style={[
                a.flex_1,
                a.text_sm,
                {lineHeight: 18},
                t.atoms.text_contrast_low,
              ]}>
              <Trans>No tags defined yet.</Trans>
            </Text>
          ) : (
            tags.map(tag => (
              <RemovableChip
                key={tag}
                label={tag}
                onRemove={() => removeTag(tag)}
              />
            ))
          )}
        </EventStopper>
      </Menu.Outer>
    </Menu.Root>
  )
}

/**
 * Splits a multi-select chip's trigger text into a truncatable name and a
 * fixed "+N" count suffix, kept separate so `MenuTrigger` can truncate only
 * the name and always keep the count visible (see `MenuTrigger`'s doc
 * comment for why concatenating them into one string doesn't work).
 */
function chipText(
  selected: string[],
  emptyLabel: string,
): {main: string; suffix?: string} {
  if (selected.length === 0) return {main: emptyLabel}
  if (selected.length === 1) return {main: selected[0]}
  return {main: selected[0], suffix: ` +${selected.length - 1}`}
}

/**
 * Author/translator/category/tags/cover-image row. Two confirmed layouts
 * from the real Figma designs: desktop shows these as a `justify-between`
 * row (metadata chips on the left, cover-image button pinned right - not a
 * single left-aligned gap-2xs row, which was an earlier mismatch); mobile
 * collapses them into an accordion card with each field as its own
 * full-width chevron row.
 *
 * Contributors is deliberately not rendered here - hidden per the project
 * owner's decision, not removed; `ContributorPicker.tsx` and
 * `site.standard.document.contributors` stay intact and untouched, this
 * screen just never populates them (`contributors` is always sent as `[]`
 * at publish time).
 */
export function Metadata({
  value,
  onChange,
  coverImagePreviewUri,
  onPressCoverImage,
  onRemoveCoverImage,
}: {
  value: MetadataValue
  onChange: (next: MetadataValue) => void
  coverImagePreviewUri?: string
  /** Opens the picker. Reached directly when there's no cover image yet. */
  onPressCoverImage: () => void
  onRemoveCoverImage: () => void
}) {
  const {_} = useLingui()
  const t = useTheme()
  const {gtMobile} = useBreakpoints()
  const [expanded, setExpanded] = useState(gtMobile)
  const {data: history} = useOwnArticleMetadataHistoryQuery()

  const set = (patch: Partial<MetadataValue>) => onChange({...value, ...patch})

  const authorChip = chipText(value.authors, _(msg`Article author name`))
  const authorPicker = (
    <MetadataSearchPicker
      triggerLabel={authorChip.main}
      triggerSuffix={authorChip.suffix}
      ariaLabel={_(msg`Author`)}
      searchPlaceholder={_(msg`Search`)}
      addInstruction={_(msg`Type a new author name, and hit enter to add it.`)}
      addPlaceholder={_(msg`New author name...`)}
      selected={value.authors}
      suggestions={history?.authors ?? []}
      onChange={authors => set({authors})}
      fullWidth={!gtMobile}
    />
  )
  const translatorChip = chipText(
    value.translators,
    _(msg`Translator name (optional)`),
  )
  const translatorPicker = (
    <MetadataSearchPicker
      triggerLabel={translatorChip.main}
      triggerSuffix={translatorChip.suffix}
      ariaLabel={_(msg`Translator`)}
      searchPlaceholder={_(msg`Search`)}
      addInstruction={_(
        msg`Type a new translator name, and hit enter to add it.`,
      )}
      addPlaceholder={_(msg`New translator name...`)}
      selected={value.translators}
      suggestions={history?.translators ?? []}
      onChange={translators => set({translators})}
      fullWidth={!gtMobile}
    />
  )
  const categoryChip = chipText(value.categories, _(msg`Not selected`))
  const categoryPicker = (
    <MetadataSearchPicker
      triggerPrefix={`${_(msg`Category`)}: `}
      triggerLabel={categoryChip.main}
      triggerSuffix={categoryChip.suffix}
      ariaLabel={_(msg`Category`)}
      searchPlaceholder={_(msg`Search`)}
      addInstruction={_(
        msg`Type a new category name, and hit enter to add it.`,
      )}
      addPlaceholder={_(msg`New category name...`)}
      selected={value.categories}
      suggestions={history?.categories ?? []}
      onChange={categories => set({categories})}
      fullWidth={!gtMobile}
    />
  )
  const tagsPicker = (
    <TagsPicker
      triggerLabel={
        value.tags.length === 0
          ? _(msg`Tags: none yet`)
          : _(msg`Tags: ${value.tags.length} defined`)
      }
      ariaLabel={_(msg`Tags`)}
      tags={value.tags}
      onChange={tags => set({tags})}
      fullWidth={!gtMobile}
    />
  )
  /**
   * Style and inner content are shared rather than the whole `Pressable`,
   * so the menu case can spread `Menu.Trigger`'s props onto *this* element
   * instead of wrapping it. Nesting a second `Pressable` around it looks
   * harmless but isn't: the inner one captures the click and the outer
   * trigger never fires, which is exactly how this button went dead after
   * a cover image was set.
   */
  const menuIconFill = () => t.atoms.border_contrast_high.borderColor

  const coverImageButtonStyle = [
    a.flex_row,
    a.align_center,
    a.justify_center,
    {gap: 8, paddingLeft: 4, paddingRight: 8, paddingVertical: 4},
    a.border,
    {borderStyle: 'dashed' as const, borderRadius: 6},
    t.atoms.border_contrast_high,
    t.atoms.bg_contrast_25,
    !gtMobile && a.w_full,
  ]

  const coverImageButtonContent = (
    <>
      {coverImagePreviewUri ? (
        <Image
          source={{uri: coverImagePreviewUri}}
          accessibilityIgnoresInvertColors
          style={[{width: 20, height: 20}, a.rounded_xs]}
        />
      ) : (
        <PhotoIcon width={20} style={[t.atoms.text_contrast_low]} />
      )}
      <Text
        style={[
          a.text_sm,
          // Overrides the component's own default leading_snug (1.3x) -
          // Figma specifies leading-normal for this label, and the
          // difference (~17px vs ~16px line-height) was enough to read as
          // "slightly larger" against the fetched reference.
          {lineHeight: 16},
          t.atoms.text_contrast_medium,
        ]}>
        {coverImagePreviewUri ? (
          <Trans>Edit cover image</Trans>
        ) : (
          <Trans>Add cover image</Trans>
        )}
      </Text>
    </>
  )

  /**
   * With a cover image set, the button opens a Remove/Change menu (Figma
   * node 246:3457) rather than jumping straight to the file picker - there
   * was previously no way to remove a cover image at all, only replace it.
   *
   * With no image yet there's nothing to remove and only one thing the
   * button could mean, so it still opens the picker directly; an
   * interstitial offering a single option would be pure friction.
   *
   * Standard `Menu.Item`/`ItemIcon`/`ItemText` at their own spec, per the
   * project owner - the design's slightly tighter gap and 6px radius are
   * deliberately not overridden, so this menu stays consistent with every
   * other dropdown in the app.
   */
  const coverImageButton = coverImagePreviewUri ? (
    <Menu.Root>
      <Menu.Trigger label={_(msg`Edit cover image`)}>
        {({props}) => (
          <Pressable {...props} style={coverImageButtonStyle}>
            {coverImageButtonContent}
          </Pressable>
        )}
      </Menu.Trigger>
      <Menu.Outer>
        {/* `fill` overrides only the glyph colour - size, spacing and the
            optical -2 nudge all stay `Menu.ItemIcon`'s own. The library
            defaults icons to `text_contrast_medium` (contrast_700), but
            this menu's design specifies `border_contrast_high`
            (contrast_300, #A5B2C5) - four steps lighter, and visibly so.
            Referenced through the same semantic atom Figma names rather
            than a raw palette step, so it follows the theme (ALF inverts
            the palette for dark/dim). */}
        <Menu.Item
          label={_(msg`Remove cover image`)}
          onPress={onRemoveCoverImage}>
          <Menu.ItemIcon icon={TrashIcon} fill={menuIconFill} />
          <Menu.ItemText>
            <Trans>Remove cover image</Trans>
          </Menu.ItemText>
        </Menu.Item>
        <Menu.Item
          label={_(msg`Change cover image`)}
          onPress={onPressCoverImage}>
          <Menu.ItemIcon icon={AttachmentIcon} fill={menuIconFill} />
          <Menu.ItemText>
            <Trans>Change cover image</Trans>
          </Menu.ItemText>
        </Menu.Item>
      </Menu.Outer>
    </Menu.Root>
  ) : (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={_(msg`Add cover image`)}
      accessibilityHint=""
      onPress={onPressCoverImage}
      style={coverImageButtonStyle}>
      {coverImageButtonContent}
    </Pressable>
  )

  if (gtMobile) {
    return (
      <View
        style={[
          a.flex_row,
          a.flex_wrap,
          a.align_center,
          a.justify_between,
          {paddingHorizontal: 18, paddingVertical: 8, rowGap: 2},
          a.border_b,
          t.atoms.border_contrast_low,
        ]}>
        <View style={[a.flex_row, a.align_center, {gap: 8}]}>
          {authorPicker}
          <View
            style={[
              {
                width: 1,
                height: 20,
                marginHorizontal: 5.5,
                backgroundColor: t.palette.contrast_100,
              },
            ]}
          />
          {translatorPicker}
          <View
            style={[
              {
                width: 1,
                height: 20,
                marginHorizontal: 5.5,
                backgroundColor: t.palette.contrast_100,
              },
            ]}
          />
          {categoryPicker}
          <View
            style={[
              {
                width: 1,
                height: 20,
                marginHorizontal: 5.5,
                backgroundColor: t.palette.contrast_100,
              },
            ]}
          />
          {tagsPicker}
        </View>
        {coverImageButton}
      </View>
    )
  }

  return (
    <View style={[a.border_b, t.atoms.border_contrast_low]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={_(msg`Article details`)}
        accessibilityHint=""
        onPress={() => setExpanded(!expanded)}
        style={[
          a.flex_row,
          a.align_center,
          a.justify_between,
          a.px_lg,
          a.py_md,
        ]}>
        <Text
          style={[
            a.text_sm,
            a.font_semi_bold,
            {lineHeight: 16},
            t.atoms.text_contrast_medium,
          ]}>
          <Trans>Article details</Trans>
        </Text>
        <ChevronDownIcon
          width={16}
          style={[
            t.atoms.text_contrast_low,
            expanded && {transform: [{rotate: '180deg'}]},
          ]}
        />
      </Pressable>
      {expanded && (
        <View style={[a.px_lg, a.pb_lg, a.gap_2xs]}>
          <View style={[a.border_b, t.atoms.border_contrast_low]}>
            {authorPicker}
          </View>
          <View style={[a.border_b, t.atoms.border_contrast_low]}>
            {translatorPicker}
          </View>
          <View style={[a.border_b, t.atoms.border_contrast_low]}>
            {categoryPicker}
          </View>
          <View style={[a.border_b, t.atoms.border_contrast_low]}>
            {tagsPicker}
          </View>
          <View style={[a.pt_sm]}>{coverImageButton}</View>
        </View>
      )}
    </View>
  )
}
