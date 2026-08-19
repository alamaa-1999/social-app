import {type StyleProp, type TextStyle} from 'react-native'

import {usePalette} from '#/lib/hooks/usePalette'
import {Text} from '#/components/Typography'

/**
 * Sunnahsky's wordmark. Upstream Bluesky renders this as hand-drawn SVG
 * letterforms - not editable text - so the rebrand here is plain text
 * instead of new custom vector art. `width` is treated as an approximate
 * target width (matching every real caller's usage, all of which only ever
 * pass `width`/`fill`/`style`), scaled to a proportional font size rather
 * than measured exactly. `style` is passed through last so a caller's own
 * styling (e.g. the native SplashScreen's dark-mode glow shadow) still
 * applies on top of the base wordmark style.
 */
export function Logotype({
  fill,
  width = 32,
  style,
}: {
  fill?: string
  width?: number
  style?: StyleProp<TextStyle>
}) {
  const pal = usePalette('default')

  return (
    <Text
      style={[
        {
          fontSize: width * 0.22,
          fontWeight: '800',
          letterSpacing: -0.5,
          color: fill || pal.text.color,
        },
        style,
      ]}
      selectable={false}>
      sunnahsky
    </Text>
  )
}
