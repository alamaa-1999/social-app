import {createSinglePathSVG} from './TEMPLATE'

/**
 * The active-item checkmark used in dropdown menu lists (e.g. the
 * Paragraph-style dropdown), exported directly from Figma (node 189:2858,
 * file pxYtWNgjV2VOLMGYr0ujlL) - a thin `stroke-width: 1.5` check, not the
 * codebase's generic bold `CheckThick_Stroke2_Corner0_Rounded`, which reads
 * noticeably heavier at the same pixel size.
 */
export const MenuItemCheck = createSinglePathSVG({
  path: 'M13.3333 4L6 11.3333L2.66667 8',
  viewBox: '0 0 16 16',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
})
