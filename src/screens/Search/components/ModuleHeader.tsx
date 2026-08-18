import {View} from 'react-native'

import {PressableScale} from '#/lib/custom-animations/PressableScale'
import {atoms as a, native, useTheme, type ViewStyleProp} from '#/alf'
import {Button, ButtonIcon} from '#/components/Button'
import {sizes as iconSizes} from '#/components/icons/common'
import {DotGrid3x1_Stroke2_Corner0_Rounded as EllipsisIcon} from '#/components/icons/DotGrid'
import {MagnifyingGlass_Stroke2_Corner0_Rounded as SearchIcon} from '#/components/icons/MagnifyingGlass'
import {Text, type TextProps} from '#/components/Typography'
import {useAnalytics} from '#/analytics'

export function Container({
  style,
  children,
  bottomBorder,
}: {
  children: React.ReactNode
  bottomBorder?: boolean
} & ViewStyleProp) {
  const t = useTheme()
  return (
    <View
      style={[
        a.flex_row,
        a.align_center,
        a.px_lg,
        a.pt_2xl,
        a.pb_md,
        a.gap_xs,
        t.atoms.bg,
        bottomBorder && [a.border_b, t.atoms.border_contrast_low],
        style,
      ]}>
      {children}
    </View>
  )
}

export function Icon({
  icon: Comp,
  size = 'lg',
}: Pick<React.ComponentProps<typeof ButtonIcon>, 'icon' | 'size'>) {
  const t = useTheme()

  const iconSize = iconSizes[size]

  return (
    <View style={[a.z_20, {width: iconSize, height: iconSize, marginLeft: -2}]}>
      <Comp width={iconSize} fill={t.atoms.text.color} />
    </View>
  )
}

export function TitleText({style, ...props}: TextProps) {
  return (
    <Text
      style={[a.font_semi_bold, a.flex_1, a.text_lg, style]}
      emoji
      {...props}
    />
  )
}

export function SubtitleText({style, ...props}: TextProps) {
  const t = useTheme()
  return (
    <Text
      style={[
        t.atoms.text_contrast_medium,
        a.leading_tight,
        a.flex_1,
        a.text_sm,
        style,
      ]}
      {...props}
    />
  )
}

export function SearchButton({
  label,
  metricsTag,
  onPress,
}: {
  label: string
  metricsTag: 'suggestedAccounts' | 'suggestedFeeds'
  onPress?: () => void
}) {
  const ax = useAnalytics()
  return (
    <Button
      label={label}
      size="small"
      variant="ghost"
      color="secondary"
      shape="round"
      PressableComponent={native(PressableScale)}
      onPress={() => {
        ax.metric('explore:module:searchButtonPress', {module: metricsTag})
        onPress?.()
      }}
      style={[
        {
          right: -4,
        },
      ]}>
      <ButtonIcon icon={SearchIcon} size="lg" />
    </Button>
  )
}

export function EllipsisButton({
  label,
  onPress,
}: {
  label: string
  onPress?: () => void
}) {
  return (
    <Button
      label={label}
      size="small"
      variant="ghost"
      color="secondary"
      shape="round"
      PressableComponent={native(PressableScale)}
      onPress={onPress}
      style={[
        {
          right: -4,
        },
      ]}>
      <ButtonIcon icon={EllipsisIcon} size="md" />
    </Button>
  )
}
