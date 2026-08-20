import {Pressable, View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'

import {atoms as a, useTheme} from '#/alf'
import {AlignCenter_Stroke2_Corner0_Rounded as AlignCenterIcon} from '#/components/icons/AlignCenter'
import {AlignLeft_Stroke2_Corner0_Rounded as AlignLeftIcon} from '#/components/icons/AlignLeft'
import {AlignRight_Stroke2_Corner0_Rounded as AlignRightIcon} from '#/components/icons/AlignRight'
import {AudioWaveform_Stroke2_Corner0_Rounded as AudioIcon} from '#/components/icons/AudioWaveform'
import {Bold_Stroke2_Corner0_Rounded as BoldIcon} from '#/components/icons/Bold'
import {BulletList_Stroke2_Corner0_Rounded as BulletListIcon} from '#/components/icons/BulletList'
import {ChevronBottom_Stroke2_Corner0_Rounded as ChevronDownIcon} from '#/components/icons/Chevron'
import {type Props as IconProps} from '#/components/icons/common'
import {InsertLink_Stroke2_Corner0_Rounded as LinkIcon} from '#/components/icons/InsertLink'
import {Italic_Stroke2_Corner0_Rounded as ItalicIcon} from '#/components/icons/Italic'
import {Paragraph_Stroke2_Corner0_Rounded as ParagraphIcon} from '#/components/icons/Paragraph'
import {Photo_Stroke2_Corner0_Rounded as PhotoIcon} from '#/components/icons/Photo'
import {Strikethrough_Stroke2_Corner0_Rounded as StrikethroughIcon} from '#/components/icons/Strikethrough'
import {Underline_Stroke2_Corner0_Rounded as UnderlineIcon} from '#/components/icons/Underline'
import * as Menu from '#/components/Menu'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'
import {isAllowedColorValue} from './colorAllowlist'

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
        a.p_sm,
        a.rounded_xs,
        (pressed || hovered) && t.atoms.bg_contrast_25,
      ]}>
      <Icon style={[t.atoms.text_contrast_medium]} width={20} />
    </Pressable>
  )
}

function ToolbarDivider() {
  const t = useTheme()
  return (
    <View style={[{width: 1, height: 20}, t.atoms.bg_contrast_25, a.mx_xs]} />
  )
}

export function Toolbar({
  onToggleMark,
  onToggleUnderline,
  onSetHeading,
  onInsertList,
  onSetAlign,
  onSetColor,
  onInsertLink,
  onInsertImage,
}: {
  onToggleMark: (mark: 'bold' | 'italic' | 'strikethrough') => void
  onToggleUnderline: () => void
  onSetHeading: (level: 1 | 2 | 3 | undefined) => void
  onInsertList: () => void
  onSetAlign: (align: 'left' | 'center' | 'right' | 'justify') => void
  onSetColor: (hex: string) => void
  onInsertLink: () => void
  onInsertImage: () => void
}) {
  const t = useTheme()
  const {_} = useLingui()

  const headingOptions: {label: string; level: 1 | 2 | 3 | undefined}[] = [
    {label: _(msg`Paragraph`), level: undefined},
    {label: _(msg`Heading 1`), level: 1},
    {label: _(msg`Heading 2`), level: 2},
    {label: _(msg`Heading 3`), level: 3},
  ]

  return (
    <View style={[a.flex_row, a.flex_wrap, a.align_center, a.gap_2xs, a.py_xs]}>
      <Menu.Root>
        <Menu.Trigger label={_(msg`Paragraph style`)}>
          {({props}) => (
            <Pressable
              {...props}
              style={[
                a.flex_row,
                a.align_center,
                a.gap_sm,
                a.px_md,
                a.py_sm,
                a.rounded_sm,
                a.border,
                t.atoms.border_contrast_medium,
              ]}>
              <ParagraphIcon style={[t.atoms.text]} width={16} />
              <Text style={[a.text_sm]}>{_(msg`Paragraph`)}</Text>
              <ChevronDownIcon
                style={[t.atoms.text_contrast_medium]}
                width={16}
              />
            </Pressable>
          )}
        </Menu.Trigger>
        <Menu.Outer>
          {headingOptions.map(({label, level}) => (
            <Menu.Item
              key={label}
              label={label}
              onPress={() => onSetHeading(level)}>
              <Menu.ItemText>{label}</Menu.ItemText>
            </Menu.Item>
          ))}
        </Menu.Outer>
      </Menu.Root>

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

      <ToolbarButton
        label={_(msg`Bulleted list`)}
        icon={BulletListIcon}
        onPress={onInsertList}
      />

      <ToolbarDivider />

      <Menu.Root>
        <Menu.Trigger label={_(msg`Text color`)}>
          {({props}) => (
            <Pressable {...props} style={[a.p_sm, a.rounded_xs]}>
              <View
                style={[
                  {width: 16, height: 16, backgroundColor: t.atoms.text.color},
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
              onPress={() => {
                // Belt-and-suspenders (finding 20): PRESET_COLORS is a fixed
                // constant that always passes, but never let a value reach
                // onSetColor without going through the allowlist - this is
                // the one call site that ever produces a #color.value.
                if (isAllowedColorValue(hex)) onSetColor(hex)
              }}>
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
  )
}
