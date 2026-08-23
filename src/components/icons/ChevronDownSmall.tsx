import {createSinglePathSVG} from './TEMPLATE'

/**
 * The dropdown/chip-trigger chevron used throughout ArticleCompose, exported
 * directly from Figma (node 183:2601, file pxYtWNgjV2VOLMGYr0ujlL) - a thin
 * open-V *stroke* (1.5pt, round caps), not a filled arrowhead shape. The
 * app's general-purpose `ChevronBottom_Stroke2_Corner0_Rounded` is a solid
 * filled path and reads noticeably bolder/bigger at the same pixel width -
 * confirmed a real mismatch, not a sizing issue, by downloading and
 * inspecting this asset directly.
 */
export const ChevronDown_Small = createSinglePathSVG({
  path: 'M4 6L8 10L12 6',
  viewBox: '0 0 16 16',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
})
