import {createSinglePathSVG} from './TEMPLATE'

/**
 * Check inside a deliberately-open ("broken") circle, exported directly from
 * Figma (node 243:3386, file pxYtWNgjV2VOLMGYr0ujlL) for the Insert-link
 * popover's confirm button, at the project owner's request. The gap in the
 * ring is part of the glyph, not a rendering artifact - which is what
 * distinguishes it from the library's closed-ring
 * `CircleCheck_Stroke2_Corner0_Rounded`.
 *
 * Note the lighter `stroke-width: 1.66667`: it sits on a solid brand-filled
 * pill and reads heavy at 2, which is why it differs from `Share04` taken
 * from the same design.
 */
export const CheckCircleBroken = createSinglePathSVG({
  path: 'M18.3333 9.2381V10.0048C18.3323 11.8018 17.7504 13.5503 16.6744 14.9896C15.5985 16.4289 14.0861 17.4818 12.3628 17.9914C10.6395 18.5009 8.79772 18.4397 7.11206 17.8169C5.4264 17.1942 3.98721 16.0432 3.00913 14.5357C2.03106 13.0281 1.56649 11.2448 1.68473 9.4517C1.80297 7.65857 2.49767 5.95171 3.66523 4.58566C4.83279 3.21962 6.41065 2.26759 8.16349 1.87156C9.91633 1.47553 11.7502 1.65672 13.3917 2.3881M18.3333 3.33333L10 11.675L7.5 9.175',
  viewBox: '0 0 20 20',
  strokeWidth: 1.66667,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
})
