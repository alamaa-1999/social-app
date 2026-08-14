import Svg, {Path, type PathProps, type SvgProps} from 'react-native-svg'

import {useTheme} from '#/alf'

const ratio = 48 / 30

export function Logomark({
  fill,
  ...rest
}: {fill?: PathProps['fill']} & SvgProps) {
  const t = useTheme()
  // @ts-ignore it's fiiiiine
  const size = parseInt(rest.width || 32)
  const _fill = fill || t.palette.primary_500
  const _fillLight = fill || t.palette.primary_300

  return (
    <Svg
      fill="none"
      viewBox="0 0 30 48"
      {...rest}
      width={size}
      height={Number(size) * ratio}>
      <Path
        fill={_fill}
        d="M0 41.2222c0 1.5341 1.24365 2.7778 2.77778 2.7778h24.44442c1.5341 0 2.7778-1.2437 2.7778-2.7778v-7.2222c0-8.2843-6.7157-15-15-15-8.28427 0-15 6.7157-15 15z"
      />
      <Path
        fill={_fillLight}
        opacity=".5"
        d="M0 6.77778c0-1.53413 1.24365-2.77778 2.77778-2.77778h24.44442c1.5341 0 2.7778 1.24365 2.7778 2.77778v7.22222c0 8.2843-6.7157 15-15 15-8.28427 0-15-6.7157-15-15z"
      />
    </Svg>
  )
}
