import {useState} from 'react'
import {Linking, Pressable, View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {atoms as a, useTheme, web} from '#/alf'
import * as TextField from '#/components/forms/TextField'
import {AlignCenter_Stroke2_Corner0_Rounded as AlignCenterIcon} from '#/components/icons/AlignCenter'
import {AlignLeft_Stroke2_Corner0_Rounded as AlignLeftIcon} from '#/components/icons/AlignLeft'
import {AlignRight_Stroke2_Corner0_Rounded as AlignRightIcon} from '#/components/icons/AlignRight'
import {AudioWaveform_Stroke2_Corner0_Rounded as AudioIcon} from '#/components/icons/AudioWaveform'
import {Bold_Stroke2_Corner0_Rounded as BoldIcon} from '#/components/icons/Bold'
import {BulletList_Stroke2_Corner0_Rounded as BulletListIcon} from '#/components/icons/BulletList'
import {CheckCircleBroken as CircleCheckIcon} from '#/components/icons/CheckCircleBroken'
import {ChevronDown_Small as ChevronDownIcon} from '#/components/icons/ChevronDownSmall'
import {type Props as IconProps} from '#/components/icons/common'
import {FootnoteA_Filled} from '#/components/icons/FootnoteA'
import {HonorificTrigger_Filled as HonorificTriggerIcon} from '#/components/icons/HonorificTrigger'
import {InsertLink_Stroke2_Corner0_Rounded as LinkIcon} from '#/components/icons/InsertLink'
import {Italic_Stroke2_Corner0_Rounded as ItalicIcon} from '#/components/icons/Italic'
import {MenuItemCheck} from '#/components/icons/MenuItemCheck'
import {Paragraph_Stroke2_Corner0_Rounded as ParagraphIcon} from '#/components/icons/Paragraph'
import {Photo_Stroke2_Corner0_Rounded as PhotoIcon} from '#/components/icons/Photo'
import {Share04 as ShareIcon} from '#/components/icons/Share04'
import {Strikethrough_Stroke2_Corner0_Rounded as StrikethroughIcon} from '#/components/icons/Strikethrough'
import {Trash_Stroke2_Corner0_Rounded as TrashIcon} from '#/components/icons/Trash'
import {Underline_Stroke2_Corner0_Rounded as UnderlineIcon} from '#/components/icons/Underline'
import * as Menu from '#/components/Menu'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'
import {HONORIFICS} from './honorifics'
import {type ParagraphStyleId} from './state'

/**
 * Preset swatches, not a free-typed color input - every value here trivially
 * passes `colorAllowlist.ts`'s hex allowlist by construction, so there's no
 * untrusted-input path to defend on the compose side at all (the allowlist
 * still matters at render time, since a value could reach this app from a
 * document authored by a different, non-Sunnahsky client).
 */
const PRESET_COLORS = [
  '#0A0A0A',
  '#C0392B',
  '#1E7A34',
  '#0059D6',
  '#8E44AD',
  '#B7791F',
]

/**
 * `isActive` reflects live editor state (bold applied at the cursor, the
 * current alignment, and so on) so the toolbar shows what the caret is
 * sitting in, not just what it can do. Every value behind it already
 * travelled to native on `useBridgeState`'s existing debounced state push -
 * see `index.tsx` - so this costs no extra round trip.
 *
 * Active styling is a background fill and nothing else - the icon keeps its
 * resting color. Specified directly by the project owner ("a background
 * hover colour behind each icon is enough of an indication", then `#E5F0FF`)
 * rather than taken from Figma, whose Article Compose page has no
 * active/selected variant for these icon buttons. Don't add a second signal
 * (icon tint, border, weight) without asking.
 *
 * `palette.primary_50` is that exact `#E5F0FF`, used as the token rather
 * than the literal so dark/dim themes stay correct - ALF builds those by
 * running `invertPalette` over this same palette, so a hardcoded light blue
 * would sit unreadably on a dark toolbar. Hover/press keep the neutral
 * `bg_contrast_25` on top, so an active control still reacts to the pointer.
 */
function ToolbarButton({
  label,
  icon: Icon,
  onPress,
  isActive = false,
}: {
  label: string
  icon: React.ComponentType<IconProps>
  onPress: () => void
  isActive?: boolean
}) {
  const t = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint=""
      accessibilityState={{selected: isActive}}
      onPress={onPress}
      style={({pressed, hovered}) => [
        {padding: 6},
        a.rounded_xs,
        isActive && {backgroundColor: t.palette.primary_50},
        (pressed || hovered) && t.atoms.bg_contrast_25,
      ]}>
      <Icon style={[t.atoms.text_contrast_low]} width={20} />
    </Pressable>
  )
}

/** 1px line, 20px tall, colored to match `border_contrast_low`'s underlying #DCE2EA (`palette.contrast_100`) - `border_contrast_low` itself only sets `borderColor`, not a fill, so it can't be used directly as a divider's background. */
function ToolbarDivider() {
  const t = useTheme()
  return (
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
  )
}

/** Chunks a flat array into fixed-size rows - used to force a rigid 4-column grid (see the doc comment on `InsertHonorificPopover` below for why this can't just be a wrapping flex row). */
function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    rows.push(items.slice(i, i + size))
  }
  return rows
}

const HONORIFIC_CELL_WIDTH = 65
const HONORIFIC_CELL_HEIGHT = 71.5

/**
 * The Paragraph-style dropdown's option list - hand-built to the exact
 * spec (node 189:2852, file pxYtWNgjV2VOLMGYr0ujlL) rather than the shared
 * `Menu.Item`/`Menu.ItemIcon` components, which don't reproduce it:
 * - Width was never set explicitly (Figma: fixed 240px, not auto).
 * - The checkmark is `Check.tsx`'s generic bold glyph; Figma's real check
 *   is a thin `stroke-width: 1.5` line (`MenuItemCheck`, its own asset),
 *   colored `primary_500`, not the default icon color.
 * - Every row reserves the same 16px icon slot, checked or not - an
 *   earlier version only rendered `Menu.ItemIcon` for the active row,
 *   which left every other row's text unaligned with the active row's.
 */
function ParagraphStyleMenu({
  options,
  activeId,
  onSelect,
}: {
  options: {id: ParagraphStyleId; label: string}[]
  activeId: ParagraphStyleId
  onSelect: (id: ParagraphStyleId) => void
}) {
  const t = useTheme()
  const {control} = Menu.useMenuContext()

  return (
    <Menu.Outer style={[{width: 240, padding: 0}]}>
      <View style={[{paddingVertical: 4}]}>
        {options.map(({id, label}) => (
          <View key={id} style={[{paddingHorizontal: 6, paddingVertical: 1}]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityHint=""
              onPress={() => {
                onSelect(id)
                control.close()
              }}
              style={({pressed, hovered}) => [
                a.flex_row,
                a.align_center,
                {
                  gap: 8,
                  paddingLeft: 10,
                  paddingRight: 6,
                  paddingVertical: 8,
                  borderRadius: 6,
                },
                (pressed || hovered) && t.atoms.bg_contrast_25,
              ]}>
              <View
                style={[
                  a.align_center,
                  a.justify_center,
                  {width: 16, height: 16},
                ]}>
                {id === activeId && (
                  <MenuItemCheck
                    width={16}
                    style={[{color: t.palette.primary_500}]}
                  />
                )}
              </View>
              <Text
                style={[
                  a.flex_1,
                  a.text_sm,
                  a.font_semi_bold,
                  {lineHeight: 20},
                  t.atoms.text_contrast_high,
                ]}>
                {label}
              </Text>
            </Pressable>
          </View>
        ))}
      </View>
    </Menu.Outer>
  )
}

function InsertHonorificPopover({
  onInsert,
  onRequestBodyFocus,
}: {
  onInsert: (codepoint: number) => void
  onRequestBodyFocus: () => void
}) {
  const {_} = useLingui()
  const t = useTheme()
  const {control} = Menu.useMenuContext()
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const hovered = hoveredIndex != null ? HONORIFICS[hoveredIndex] : null

  // padding: 0 overrides Menu.Outer's own default 4px shell padding
  // (a.p_xs) - this popover builds its own complete header/grid/footer
  // padding matching Figma's spec exactly, so the shared component's
  // default padding is pure surplus that pushes everything inward.
  return (
    <Menu.Outer
      style={[{width: 308, padding: 0}]}
      // Radix's DropdownMenu.Content auto-focuses the trigger button when
      // it closes, by design - that's what was actually stealing focus
      // from the article body (the onMouseDown/preventDefault fix above
      // only stops the *click* from stealing focus, not this separate
      // close-time behavior). Preventing the default here and explicitly
      // asking for the body input back is the correct interception point.
      onCloseAutoFocus={e => {
        e.preventDefault()
        onRequestBodyFocus()
      }}>
      <View style={[{padding: 12}, a.border_b, t.atoms.border_contrast_low]}>
        <Text
          style={[
            a.text_sm,
            a.font_medium,
            {lineHeight: 16},
            t.atoms.text_contrast_medium,
          ]}>
          <Trans>Click an honorific icon to insert it.</Trans>
        </Text>
      </View>
      {/* A true 4-column grid (node 175:2447, file pxYtWNgjV2VOLMGYr0ujlL:
      "grid-cols-[repeat(4,minmax(0,1fr))]"), not a wrapping flex row - an
      earlier version used flex-wrap, which lets a cell whose ligature
      measures wider than expected push the wrap point around, producing
      rows of 3 instead of a rigid 4. Chunking into explicit 4-item rows
      makes that structurally impossible regardless of any one glyph's
      measured width. Exact cell size (65x71.5) and gaps (8px both
      directions) read directly from that node's metadata, not guessed. */}
      <View style={[{paddingHorizontal: 12, paddingVertical: 8, gap: 8}]}>
        {chunk(HONORIFICS, 4).map((row, rowIndex) => (
          <View key={rowIndex} style={[a.flex_row, {gap: 8}]}>
            {row.map((h, colIndex) => {
              const i = rowIndex * 4 + colIndex
              return (
                <Pressable
                  key={h.codepoint}
                  accessibilityRole="button"
                  accessibilityLabel={_(msg`${h.name} - ${h.meaning}`)}
                  accessibilityHint=""
                  onPress={() => {
                    onInsert(h.codepoint)
                    // Close the popover immediately after insert so the
                    // author can carry on typing without an extra dismiss
                    // click - matches Menu.Item's own close-on-select
                    // behavior, which these hand-built grid cells don't get
                    // for free since they bypass Menu.Item entirely.
                    control.close()
                  }}
                  onHoverIn={() => setHoveredIndex(i)}
                  onHoverOut={() => setHoveredIndex(null)}
                  // Keeps focus (and the caret position) on the article
                  // body input throughout - without this, the browser
                  // shifts focus to the button on click, so after the
                  // popover closes the author has to click back into the
                  // body to keep typing. preventDefault on mousedown (not
                  // the click/onPress itself) stops that focus shift before
                  // it happens; web-only, a no-op on native.
                  {...web({
                    onMouseDown: (e: {preventDefault: () => void}) =>
                      e.preventDefault(),
                  })}
                  style={({pressed, hovered: isHovered}) => [
                    {
                      width: HONORIFIC_CELL_WIDTH,
                      height: HONORIFIC_CELL_HEIGHT,
                      padding: 4,
                    },
                    a.align_center,
                    a.justify_center,
                    a.rounded_sm,
                    (pressed || isHovered || hoveredIndex === i) && {
                      backgroundColor: t.palette.primary_50,
                    },
                  ]}>
                  <Text
                    style={[
                      {
                        fontFamily: 'Scheherazade New',
                        fontSize: 32,
                        lineHeight: 46,
                      },
                      t.atoms.text,
                    ]}>
                    {String.fromCodePoint(h.codepoint)}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        ))}
      </View>
      <View
        style={[
          a.border_t,
          t.atoms.border_contrast_low,
          {paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, gap: 3},
        ]}>
        {hovered ? (
          <>
            <Text
              style={[
                a.text_sm,
                a.font_medium,
                {lineHeight: 18},
                t.atoms.text_contrast_high,
              ]}>
              {hovered.name.toUpperCase()}
            </Text>
            <Text
              style={[
                a.text_sm,
                {lineHeight: 18},
                t.atoms.text_contrast_medium,
              ]}>
              {hovered.meaning}
            </Text>
          </>
        ) : (
          <>
            <Text
              style={[
                a.text_sm,
                a.font_medium,
                {lineHeight: 18},
                t.atoms.text_contrast_medium,
              ]}>
              <Trans>Hover over a symbol to see what it means.</Trans>
            </Text>
            <Text
              style={[a.text_sm, {lineHeight: 18}, t.atoms.text_contrast_low]}>
              <Trans>No symbol selected yet.</Trans>
            </Text>
          </>
        )}
      </View>
    </Menu.Outer>
  )
}

/**
 * Scheme allowlist for links this composer creates, deliberately identical
 * to the one `editor-web/serializer/sanitize.ts` enforces when a document is
 * loaded - so the composer can never author a link the renderer would later
 * strip, which would look like the link silently vanishing.
 */
const LINK_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'tel:'])

/**
 * Returns the URL to actually apply, or `undefined` if what's typed isn't
 * one. A bare `example.com` gets `https://`, which is what "Paste a link"
 * implies; anything with an unsupported scheme (`javascript:` above all)
 * fails closed rather than being written as an href.
 */
function normalizeLinkUrl(raw: string): string | undefined {
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`
  try {
    if (!LINK_SCHEMES.has(new URL(candidate).protocol)) return undefined
    return candidate
  } catch {
    return undefined
  }
}

/**
 * Insert-link popover - Figma nodes 243:3299 and 243:3439 (file
 * pxYtWNgjV2VOLMGYr0ujlL). Those two frames are two *states* of one
 * component, not two components: the field's text colour is just
 * placeholder-vs-value (which `TextField` already handles), and the confirm
 * button is `primary_200` with a dimmed glyph until there's a usable URL,
 * `primary_500` once there is.
 *
 * Behaviour follows TipTap's own link-popover contract - set, remove, open,
 * prefill from the active link, Enter applies, Escape closes - driven
 * through TenTap's `LinkBridge`, where `setLink(url)` applies and
 * `setLink(null)` removes.
 *
 * The input is the app's real `TextField`, not a hand-rolled one: the Figma
 * component's own description names `src/components/forms/TextField.tsx` as
 * its source of truth, and the chrome the design draws (primary_25 fill,
 * primary_500 border) is precisely that component's *focus* state, which it
 * reaches by itself because the field autofocuses when the popover opens.
 * `LabelText` likewise already carries the design's `text_sm`/`font_medium`/
 * `text_contrast_medium` and its own 8px bottom margin, so the label needs
 * no restyling and the group needs no explicit gap.
 */
function InsertLinkPopover({
  initialUrl,
  canRemove,
  onSubmit,
  onRemove,
  onRequestBodyFocus,
}: {
  initialUrl: string | undefined
  canRemove: boolean
  onSubmit: (url: string) => void
  onRemove: () => void
  onRequestBodyFocus: () => void
}) {
  const {_} = useLingui()
  const t = useTheme()
  const {control} = Menu.useMenuContext()
  const [value, setValue] = useState(initialUrl ?? '')
  const normalized = normalizeLinkUrl(value)

  const submit = () => {
    if (!normalized) return
    onSubmit(normalized)
    control.close()
  }

  return (
    <Menu.Outer
      style={[{width: 334, padding: 0}]}
      // Same interception as InsertHonorificPopover: Radix pulls focus back
      // to the trigger on close, which would leave the caret out of the
      // article body right after the author applied a link to it.
      onCloseAutoFocus={e => {
        e.preventDefault()
        onRequestBodyFocus()
      }}>
      <View style={[{padding: 12}, a.border_b, t.atoms.border_contrast_low]}>
        <TextField.LabelText>
          <Trans>Paste a link.</Trans>
        </TextField.LabelText>
        <TextField.Root>
          <TextField.Input
            label={_(msg`Type here...`)}
            value={value}
            onChangeText={setValue}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="done"
            onSubmitEditing={submit}
          />
        </TextField.Root>
      </View>
      <View
        style={[
          a.flex_row,
          a.align_center,
          a.justify_between,
          {paddingTop: 12, paddingBottom: 16, paddingHorizontal: 12},
        ]}>
        <View style={[a.flex_row, a.align_center, {gap: 8}]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={_(msg`Remove link`)}
            accessibilityHint=""
            disabled={!canRemove}
            onPress={() => {
              onRemove()
              control.close()
            }}
            style={({pressed, hovered}) => [
              a.align_center,
              a.justify_center,
              {padding: 6, borderRadius: 6},
              !canRemove && {opacity: 0.5},
              (pressed || hovered) && t.atoms.bg_contrast_25,
            ]}>
            <TrashIcon width={20} style={[t.atoms.text_contrast_low]} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={_(msg`Open link`)}
            accessibilityHint=""
            disabled={!normalized}
            onPress={() => {
              if (normalized) void Linking.openURL(normalized)
            }}
            style={({pressed, hovered}) => [
              a.align_center,
              a.justify_center,
              {padding: 6, borderRadius: 6},
              !normalized && {opacity: 0.5},
              (pressed || hovered) && t.atoms.bg_contrast_25,
            ]}>
            <ShareIcon width={20} style={[t.atoms.text_contrast_low]} />
          </Pressable>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={_(msg`Apply link`)}
          accessibilityHint=""
          disabled={!normalized}
          onPress={submit}
          style={[
            a.align_center,
            a.justify_center,
            {
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 999,
              backgroundColor: normalized
                ? t.palette.primary_500
                : t.palette.primary_200,
            },
          ]}>
          <CircleCheckIcon
            width={20}
            style={[{color: t.palette.white}, !normalized && {opacity: 0.6}]}
          />
        </Pressable>
      </View>
    </Menu.Outer>
  )
}

export function Toolbar({
  onToggleMark,
  onToggleUnderline,
  activeParagraphStyle,
  activeMarks,
  activeTextAlign,
  activeColor,
  isBulletListActive,
  onSelectParagraphStyle,
  onInsertList,
  onSetAlign,
  onSetColor,
  onInsertHonorific,
  onRequestBodyFocus,
  activeLink,
  canSetLink,
  isLinkActive,
  onSetLink,
  onRemoveLink,
  onLinkUnavailable,
  onInsertImage,
}: {
  onToggleMark: (mark: 'bold' | 'italic' | 'strikethrough') => void
  onToggleUnderline: () => void
  activeParagraphStyle: ParagraphStyleId
  /**
   * Which inline marks apply at the caret. Sourced from the editor's own
   * live state (`useBridgeState`), so it tracks cursor movement into
   * already-formatted text, not just presses of these buttons.
   */
  activeMarks: {
    bold: boolean
    italic: boolean
    underline: boolean
    strikethrough: boolean
  }
  activeTextAlign: 'left' | 'center' | 'right' | 'justify'
  /**
   * The color mark applied at the caret, or `undefined` for unstyled text.
   * Already allowlist-checked by `index.tsx` - a document authored elsewhere
   * can carry any color string, and this one gets rendered as a real fill.
   */
  activeColor: string | undefined
  isBulletListActive: boolean
  onSelectParagraphStyle: (style: ParagraphStyleId) => void
  onInsertList: () => void
  onSetAlign: (align: 'left' | 'center' | 'right' | 'justify') => void
  onSetColor: (hex: string) => void
  onInsertHonorific: (codepoint: number) => void
  onRequestBodyFocus: () => void
  /** The href on the link at the caret, if the caret is inside one. */
  activeLink: string | undefined
  /** False when there's no selection to attach a link to. */
  canSetLink: boolean
  isLinkActive: boolean
  onSetLink: (url: string) => void
  onRemoveLink: () => void
  /** Called when the link button is pressed with nothing to link. */
  onLinkUnavailable: () => void
  onInsertImage: () => void
}) {
  const t = useTheme()
  const {_} = useLingui()

  const paragraphStyleOptions: {id: ParagraphStyleId; label: string}[] = [
    {id: 'title', label: _(msg`Title`)},
    {id: 'subheading1', label: _(msg`Sub-Heading 1`)},
    {id: 'subheading2', label: _(msg`Sub-Heading 2`)},
    {id: 'paragraph', label: _(msg`Paragraph`)},
    {id: 'arabicParagraph', label: _(msg`Arabic Paragraph`)},
    {id: 'blockQuote', label: _(msg`Block Quote`)},
    {id: 'arabicBlockQuote', label: _(msg`Arabic Block Quote`)},
    {id: 'bulletedList', label: _(msg`Bulleted List`)},
    {id: 'numberedList', label: _(msg`Numbered List`)},
  ]
  const activeParagraphStyleLabel =
    paragraphStyleOptions.find(o => o.id === activeParagraphStyle)?.label ??
    _(msg`Paragraph`)

  return (
    // Two real sibling groups, matching Figma's "Text editor toolbar" DOM
    // exactly (node 58:5063): Paragraph-style select and "Formatting
    // buttons" are direct children of this 12px-gap row (spacing-lg's
    // column-gap) - NOT one flat row. Everything inside "Formatting
    // buttons" then uses its own much tighter 2px gap (spacing-xxs), with
    // the dividers' own 12px width supplying the visual separation between
    // sub-groups. Flattening this into one uniform-gap row (an earlier
    // version of this file did) starves the Paragraph-select/Bold seam of
    // ~10px of spacing Figma actually has there.
    <View style={[a.flex_row, a.flex_wrap, a.align_center, {gap: 12}]}>
      <Menu.Root>
        <Menu.Trigger label={_(msg`Paragraph style`)}>
          {({props}) => (
            <Pressable
              {...props}
              style={[
                // height: 36 pinned explicitly, matching Figma's own
                // "152 Hug x 36 Hug" - Figma represents this border as a
                // negative-offset `outline` (inset, doesn't affect box
                // size), but RN's `borderWidth` always adds to an
                // auto-derived height. width is already fixed, so the
                // border already draws inset there for free; height needs
                // the same explicit pin, or the 1px top+1px bottom border
                // quietly adds 2px on top of the 8/8 padding + 20px content
                // math (which alone already lands on exactly 36). Width
                // widened from Figma's own 152 to 216 (still under
                // maxWidth: 240) - the longest paragraph-style label
                // ("Arabic Block Quote") wraps to two lines below that, a
                // real usability issue this size wasn't scoped to solve.
                {width: 216, maxWidth: 240, height: 36},
                a.flex_row,
                a.align_center,
                // The real structure (per this element's own CSS export)
                // is `justify-content: flex-start` + a fixed 8px gap
                // between the icon+text group and the chevron - NOT
                // `justify-content: space-between`. The icon+text group
                // itself is `flex: 1 1 0` (grows to fill the remaining
                // space), which is what actually pushes the chevron to the
                // right edge - visually similar to space-between in most
                // cases, but not pixel-identical, which is what the
                // earlier space-between version was off by.
                {gap: 8, paddingLeft: 12, paddingRight: 10, paddingVertical: 8},
                a.rounded_sm,
                a.border,
                t.atoms.border_contrast_medium,
                t.atoms.bg,
                t.atoms.shadow_xs,
              ]}>
              <View style={[a.flex_1, a.flex_row, a.align_center, {gap: 8}]}>
                {/* text_contrast_low, not t.atoms.text (black) - confirmed
                by this element's own CSS export (`StyledIcon`'s outline
                color). */}
                <ParagraphIcon style={[t.atoms.text_contrast_low]} width={16} />
                {/* fontSize 14 (not a.text_sm's 13.1) and lineHeight 20 (not
                the 16 "leading-normal" pattern used elsewhere) - this
                specific trigger's text uses the ALF *semantic* text-sm
                (14px/20px), confirmed independently twice: the original
                fetched reference code and this element's own CSS export. */}
                <Text
                  style={[
                    a.font_medium,
                    {fontSize: 14, lineHeight: 20},
                    t.atoms.text,
                  ]}>
                  {activeParagraphStyleLabel}
                </Text>
              </View>
              <ChevronDownIcon style={[t.atoms.text_contrast_low]} width={16} />
            </Pressable>
          )}
        </Menu.Trigger>
        <ParagraphStyleMenu
          options={paragraphStyleOptions}
          activeId={activeParagraphStyle}
          onSelect={onSelectParagraphStyle}
        />
      </Menu.Root>

      <View style={[a.flex_row, a.flex_wrap, a.align_center, a.gap_2xs]}>
        <ToolbarButton
          label={_(msg`Bold`)}
          icon={BoldIcon}
          isActive={activeMarks.bold}
          onPress={() => onToggleMark('bold')}
        />
        <ToolbarButton
          label={_(msg`Italic`)}
          icon={ItalicIcon}
          isActive={activeMarks.italic}
          onPress={() => onToggleMark('italic')}
        />
        <ToolbarButton
          label={_(msg`Underline`)}
          icon={UnderlineIcon}
          isActive={activeMarks.underline}
          onPress={onToggleUnderline}
        />
        <ToolbarButton
          label={_(msg`Strikethrough`)}
          icon={StrikethroughIcon}
          isActive={activeMarks.strikethrough}
          onPress={() => onToggleMark('strikethrough')}
        />

        <ToolbarDivider />

        <Menu.Root>
          <Menu.Trigger label={_(msg`Insert honorific`)}>
            {({props}) => (
              <Pressable
                {...props}
                style={({pressed, hovered}) => [
                  {height: 32, paddingLeft: 4, gap: 6},
                  a.flex_row,
                  a.align_center,
                  a.rounded_xs,
                  (pressed || hovered) && t.atoms.bg_contrast_25,
                ]}>
                {/* Static exported vector (node 164:320), NOT live
                Scheherazade New text - confirmed directly by the project
                owner as scoped only to this trigger, unlike the popover
                grid below (which stays live text). Wrapped in its own
                20x20 box so the 18x16 icon centers with the same 1px/2px
                inset Figma's own "inset-[10%_5%]" specifies. */}
                <View
                  style={[
                    {width: 20, height: 20},
                    a.align_center,
                    a.justify_center,
                  ]}>
                  <HonorificTriggerIcon
                    width={18}
                    style={[t.atoms.text_contrast_low]}
                  />
                </View>
                <ChevronDownIcon
                  style={[t.atoms.text_contrast_low]}
                  width={16}
                />
              </Pressable>
            )}
          </Menu.Trigger>
          <InsertHonorificPopover
            onInsert={onInsertHonorific}
            onRequestBodyFocus={onRequestBodyFocus}
          />
        </Menu.Root>

        <ToolbarDivider />

        <Menu.Root>
          <Menu.Trigger label={_(msg`Text color`)}>
            {({props}) => (
              <Pressable {...props} style={[a.p_sm, a.rounded_xs]}>
                {/* Shows the color actually applied at the caret, falling
                    back to the theme's own text color when no color mark is
                    set - which is what unstyled text really renders as, so
                    the swatch stays truthful rather than implying a choice
                    the author never made. `activeColor` is allowlist-checked
                    in `index.tsx` before it ever reaches here. */}
                <View
                  style={[
                    {
                      width: 16,
                      height: 16,
                      backgroundColor: activeColor ?? t.atoms.text.color,
                    },
                    a.rounded_full,
                    a.border,
                    t.atoms.border_contrast_low,
                  ]}
                />
              </Pressable>
            )}
          </Menu.Trigger>
          <Menu.Outer>
            {PRESET_COLORS.map(hex => (
              <Menu.Item
                key={hex}
                label={hex}
                // Finding 20's allowlist now lives in onSetColor itself (the
                // actual point of construction, not this call site) - see
                // index.tsx. PRESET_COLORS is a fixed constant that always
                // passes it anyway, so nothing changes here, just no
                // duplicate check to keep in sync.
                onPress={() => onSetColor(hex)}>
                <View
                  style={[
                    {width: 14, height: 14, backgroundColor: hex},
                    a.rounded_full,
                    a.mr_xs,
                  ]}
                />
                <Menu.ItemText>{hex}</Menu.ItemText>
                {/* Case-insensitive: `PRESET_COLORS` are uppercase, but the
                    value comes back from the editor's own attribute store
                    and there's no guarantee it preserves case. */}
                {activeColor?.toLowerCase() === hex.toLowerCase() && (
                  <Menu.ItemIcon icon={MenuItemCheck} />
                )}
              </Menu.Item>
            ))}
          </Menu.Outer>
        </Menu.Root>

        <ToolbarDivider />

        <ToolbarButton
          label={_(msg`Align left`)}
          icon={AlignLeftIcon}
          isActive={activeTextAlign === 'left'}
          onPress={() => onSetAlign('left')}
        />
        <ToolbarButton
          label={_(msg`Align center`)}
          icon={AlignCenterIcon}
          isActive={activeTextAlign === 'center'}
          onPress={() => onSetAlign('center')}
        />
        <ToolbarButton
          label={_(msg`Align right`)}
          icon={AlignRightIcon}
          isActive={activeTextAlign === 'right'}
          onPress={() => onSetAlign('right')}
        />

        <ToolbarDivider />

        <ToolbarButton
          label={_(msg`Bulleted list`)}
          icon={BulletListIcon}
          isActive={isBulletListActive}
          onPress={onInsertList}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={_(msg`Insert footnote`)}
          accessibilityHint=""
          onPress={() => {
            // Phase 2a decision: footnotes are unsupported by the markdown
            // renderer this pass - the button itself must be a real, working
            // press handler though, not inert (same treatment as Insert Audio).
            Toast.show(
              _(msg`Footnotes will be available in a future version.`),
              {type: 'info'},
            )
          }}
          style={({pressed, hovered}) => [
            {padding: 6},
            a.rounded_xs,
            a.align_center,
            a.justify_center,
            (pressed || hovered) && t.atoms.bg_contrast_25,
          ]}>
          <FootnoteA_Filled width={20} style={[t.atoms.text_contrast_low]} />
        </Pressable>

        <ToolbarDivider />

        <Menu.Root>
          <Menu.Trigger label={_(msg`Insert link`)}>
            {({props}) => (
              <Pressable
                {...props}
                accessibilityState={{selected: isLinkActive}}
                // Deliberately always pressable, never disabled. A disabled
                // control explains nothing; the project owner asked for the
                // toast back because being told *what to do* ("select some
                // text first") is more use than a button that silently
                // refuses. Matches TipTap's own `useLinkPopover`, whose
                // `hideWhenUnavailable` defaults to false for the same
                // reason. The guard itself lives in the press handler.
                onPress={() => {
                  if (!canSetLink && !isLinkActive) {
                    onLinkUnavailable()
                    return
                  }
                  props.onPress?.()
                }}
                style={({pressed, hovered}) => [
                  {padding: 6},
                  a.rounded_xs,
                  isLinkActive && {backgroundColor: t.palette.primary_50},
                  (pressed || hovered) && t.atoms.bg_contrast_25,
                ]}>
                <LinkIcon width={20} style={[t.atoms.text_contrast_low]} />
              </Pressable>
            )}
          </Menu.Trigger>
          <InsertLinkPopover
            // Remounts the popover per link context, so the field always
            // opens showing the href actually at the caret rather than
            // whatever was typed the last time it was opened.
            key={activeLink ?? ''}
            initialUrl={activeLink}
            canRemove={isLinkActive}
            onSubmit={onSetLink}
            onRemove={onRemoveLink}
            onRequestBodyFocus={onRequestBodyFocus}
          />
        </Menu.Root>
        <ToolbarButton
          label={_(msg`Insert audio`)}
          icon={AudioIcon}
          onPress={() => {
            // Phase 2a decision: descoped this pass, but the button itself
            // must be a real, working press handler - not inert.
            Toast.show(
              _(msg`Audio insertion will be available in a future version.`),
              {type: 'info'},
            )
          }}
        />
        <ToolbarButton
          label={_(msg`Insert image`)}
          icon={PhotoIcon}
          onPress={onInsertImage}
        />
      </View>
    </View>
  )
}
