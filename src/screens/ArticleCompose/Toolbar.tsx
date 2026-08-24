import {useState} from 'react'
import {Pressable, View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {atoms as a, useTheme, web} from '#/alf'
import {AlignCenter_Stroke2_Corner0_Rounded as AlignCenterIcon} from '#/components/icons/AlignCenter'
import {AlignLeft_Stroke2_Corner0_Rounded as AlignLeftIcon} from '#/components/icons/AlignLeft'
import {AlignRight_Stroke2_Corner0_Rounded as AlignRightIcon} from '#/components/icons/AlignRight'
import {AudioWaveform_Stroke2_Corner0_Rounded as AudioIcon} from '#/components/icons/AudioWaveform'
import {Bold_Stroke2_Corner0_Rounded as BoldIcon} from '#/components/icons/Bold'
import {BulletList_Stroke2_Corner0_Rounded as BulletListIcon} from '#/components/icons/BulletList'
import {ChevronDown_Small as ChevronDownIcon} from '#/components/icons/ChevronDownSmall'
import {type Props as IconProps} from '#/components/icons/common'
import {FootnoteA_Filled} from '#/components/icons/FootnoteA'
import {HonorificTrigger_Filled as HonorificTriggerIcon} from '#/components/icons/HonorificTrigger'
import {InsertLink_Stroke2_Corner0_Rounded as LinkIcon} from '#/components/icons/InsertLink'
import {Italic_Stroke2_Corner0_Rounded as ItalicIcon} from '#/components/icons/Italic'
import {MenuItemCheck} from '#/components/icons/MenuItemCheck'
import {Paragraph_Stroke2_Corner0_Rounded as ParagraphIcon} from '#/components/icons/Paragraph'
import {Photo_Stroke2_Corner0_Rounded as PhotoIcon} from '#/components/icons/Photo'
import {Strikethrough_Stroke2_Corner0_Rounded as StrikethroughIcon} from '#/components/icons/Strikethrough'
import {Underline_Stroke2_Corner0_Rounded as UnderlineIcon} from '#/components/icons/Underline'
import * as Menu from '#/components/Menu'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'
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
 * Exact codepoint/name/meaning data for the 16-glyph Insert Honorific grid,
 * supplied directly by the project owner - not re-derived from glyph
 * rendering. Rendered via Scheherazade New (already loaded, Phase 2a). A
 * further 8+ entries from the owner's own reference list are deliberately
 * not included here - reference/future, not part of this build.
 */
const HONORIFICS: {codepoint: number; name: string; meaning: string}[] = [
  {
    codepoint: 0xfdfe,
    name: 'Subhaanahu wa Taaalaa',
    meaning:
      'May He be praised and exalted (Glorified and Lofty). The most common honorific for God.',
  },
  {
    codepoint: 0xfdff,
    name: 'Azza wa Jall',
    meaning:
      'The Glorified/Exalted/Mighty and Sublime. The second most common honorific for God.',
  },
  {
    codepoint: 0xfd4e,
    name: 'Tabaaraka wa-Taaalaa',
    meaning:
      'May he be blessed and exalted. One of the honorifics used only for God himself.',
  },
  {
    codepoint: 0xfdfa,
    name: 'Sallallahou Alayhe Wasallam',
    meaning:
      'The blessings and peace of God be upon him. Used after the name of a major prophet, especially the Prophet of Islam.',
  },
  {
    codepoint: 0xfd4a,
    name: 'Alayhi as-Salaatu was-Salaam',
    meaning:
      'Blessings and Peace be upon him. A lesser-used honorific for a prophet/Archangel.',
  },
  {
    codepoint: 0xfd47,
    name: 'Alayhi as-Salaam',
    meaning:
      "Peace be upon him. The normal honorific after a prophet's/Archangel's name.",
  },
  {
    codepoint: 0xfd49,
    name: 'Alayhimaa as-Salaam',
    meaning: 'Peace be upon them (both). Used for prophets and angels.',
  },
  {
    codepoint: 0xfd4d,
    name: 'Alayhaa as-Salaam',
    meaning:
      'Peace be upon her. Used after the name of a woman who was the mother of a prophet.',
  },
  {
    codepoint: 0xfd48,
    name: 'Alayhim as-Salaam',
    meaning:
      'Peace be upon them (masculine plural). Used for two or more prophets.',
  },
  {
    codepoint: 0xfd41,
    name: 'Radi Allaahu Anh',
    meaning: 'May God be pleased with him. Used for companions of the Prophet.',
  },
  {
    codepoint: 0xfd42,
    name: 'Radi Allaahu Anhaa',
    meaning:
      "May God be pleased with her. Companions of the Prophet, also Mary/Jesus' apostles in some regions.",
  },
  {
    codepoint: 0xfd44,
    name: 'Radi Allaahu Anhumaa',
    meaning:
      'May God be pleased with them (both). Used for companions of the Prophet.',
  },
  {
    codepoint: 0xfd43,
    name: 'Radi Allaahu Anhum',
    meaning:
      'May God be pleased with them (masc. plural, or mixed group). Used for companions of the Prophet.',
  },
  {
    codepoint: 0xfd45,
    name: 'Radi Allaahu Anhunna',
    meaning:
      'May God be pleased with them (feminine). Used for companions of the Prophet.',
  },
  {
    codepoint: 0xfd40,
    name: 'Rahimahu Allaah',
    meaning:
      'May God have mercy upon him. Companions of the Prophet, widely recognized scholars, or any deceased believer.',
  },
  {
    codepoint: 0xfd4f,
    name: 'Rahimahum Allaah',
    meaning:
      'God have mercy upon them (masculine). Widely recognized scholars, also ordinary believers.',
  },
]

function ToolbarButton({
  label,
  icon: Icon,
  onPress,
}: {
  label: string
  icon: React.ComponentType<IconProps>
  onPress: () => void
}) {
  const t = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint=""
      onPress={onPress}
      style={({pressed, hovered}) => [
        {padding: 6},
        a.rounded_xs,
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

export function Toolbar({
  onToggleMark,
  onToggleUnderline,
  activeParagraphStyle,
  onSelectParagraphStyle,
  onInsertList,
  onSetAlign,
  onSetColor,
  onInsertHonorific,
  onRequestBodyFocus,
  onInsertLink,
  onInsertImage,
}: {
  onToggleMark: (mark: 'bold' | 'italic' | 'strikethrough') => void
  onToggleUnderline: () => void
  activeParagraphStyle: ParagraphStyleId
  onSelectParagraphStyle: (style: ParagraphStyleId) => void
  onInsertList: () => void
  onSetAlign: (align: 'left' | 'center' | 'right' | 'justify') => void
  onSetColor: (hex: string) => void
  onInsertHonorific: (codepoint: number) => void
  onRequestBodyFocus: () => void
  onInsertLink: () => void
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
          onPress={() => onToggleMark('bold')}
        />
        <ToolbarButton
          label={_(msg`Italic`)}
          icon={ItalicIcon}
          onPress={() => onToggleMark('italic')}
        />
        <ToolbarButton
          label={_(msg`Underline`)}
          icon={UnderlineIcon}
          onPress={onToggleUnderline}
        />
        <ToolbarButton
          label={_(msg`Strikethrough`)}
          icon={StrikethroughIcon}
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
                <View
                  style={[
                    {
                      width: 16,
                      height: 16,
                      backgroundColor: t.atoms.text.color,
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
              </Menu.Item>
            ))}
          </Menu.Outer>
        </Menu.Root>

        <ToolbarDivider />

        <ToolbarButton
          label={_(msg`Align left`)}
          icon={AlignLeftIcon}
          onPress={() => onSetAlign('left')}
        />
        <ToolbarButton
          label={_(msg`Align center`)}
          icon={AlignCenterIcon}
          onPress={() => onSetAlign('center')}
        />
        <ToolbarButton
          label={_(msg`Align right`)}
          icon={AlignRightIcon}
          onPress={() => onSetAlign('right')}
        />

        <ToolbarDivider />

        <ToolbarButton
          label={_(msg`Bulleted list`)}
          icon={BulletListIcon}
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

        <ToolbarButton
          label={_(msg`Insert link`)}
          icon={LinkIcon}
          onPress={onInsertLink}
        />
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
