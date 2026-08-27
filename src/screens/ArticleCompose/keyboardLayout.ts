/**
 * Pure positioning arithmetic for `ArticleCompose`'s mobile keyboard-
 * avoidance layout - extracted after a session of live, empirical
 * iteration found these relationships the hard way, including two
 * separate double-counting bugs that a written model would have made
 * structurally impossible rather than something to discover by testing.
 * Written down once, here, so nobody has to re-derive it by trial and
 * error again. Full account of the iteration itself is in
 * `Sunnahsky_Week3_Engineering_Notes.md`'s "Composer polish pass, part
 * three".
 *
 * The dependency model
 * ---------------------
 * Seven quantities feed three elements' positions on mobile:
 *
 * - `headerHeight` - measured height of the header + Article details
 *   block. Stays in *normal flow*, never `position: fixed`.
 * - `topToolbarHeight` - measured height of the top toolbar's own
 *   wrapper. Removed from flow (`position: fixed`).
 * - `panOffset` - `visualViewport.offsetTop`, live. `0` with nothing
 *   focused; grows while the browser pans the visible slice of the
 *   (unchanged) layout viewport to keep a focused caret in view. This is
 *   not a document scroll - `position: fixed` is already immune to that -
 *   it is a *different* slice of the same layout viewport becoming the
 *   visible one, which a `top: 0` fixed element does not track on its own.
 * - `windowInnerHeight` - `window.innerHeight`, the *layout* viewport's
 *   own height. Never shrinks for the keyboard, since this app's viewport
 *   meta tag uses the default `interactive-widget=resizes-visual`.
 * - `visualViewportHeight` - `visualViewport.height`, live. Shrinks when
 *   the keyboard opens; does *not* account for Gboard's own toolbar strip
 *   (see `gboardStripBuffer` below).
 * - `gboardStripBuffer` - a flat, empirically-tuned constant, not derived
 *   from any measurement - no API exposes Gboard's own persistent toolbar
 *   strip (emoji/GIF/translate/mic, drawn above its key rows) as a height.
 *   The one genuinely irreducible unknown in this model; everything else
 *   below is exact arithmetic, not a fitted number.
 *
 * And three elements, each a function of a *subset* of the above - stating
 * which subset is exactly what prevents double-counting:
 *
 * - Top toolbar's `top` = `max(headerHeight, panOffset)`. Rests right
 *   below the header when nothing's focused (`panOffset` is `0`); once
 *   panning would otherwise carry it past the header, tracks the pan
 *   instead, so it stays on-screen as the header scrolls out of view.
 *
 * - WebView's `marginTop` = `topToolbarHeight + max(0, panOffset -
 *   headerHeight)`. The flat `topToolbarHeight` term is the original fix:
 *   the header stays in normal flow, so the WebView (the next normal-flow
 *   sibling) already starts right after it for free, and adding
 *   `headerHeight` a second time here was a real double-counting bug found
 *   during development - it pushed the WebView an extra `headerHeight`
 *   further down than intended, reproducing the same symptom (a large
 *   empty gap) an earlier, analogous mistake on the `panOffset` side had
 *   already produced and been fixed once before.
 *
 *   That fix went one step too far, though: it dropped `headerHeight` from
 *   this formula *entirely*, including the one regime where it genuinely
 *   belongs. Once panning pushes the toolbar's own `top` past its resting
 *   position - `panOffset > headerHeight`, the exact condition
 *   `computeTopToolbarTop` above reacts to - the toolbar is now sitting
 *   `panOffset - headerHeight` px further down-screen than this static
 *   margin knows about, and the WebView's first line of content (its own
 *   caret included) renders *under* that extra strip. Confirmed live: an
 *   empty document, keyboard open, caret rendering partly hidden beneath
 *   the toolbar the moment panning carries it past the header. The `max(0,
 *   ...)` floor is what keeps this term inert - preserving the original
 *   double-counting fix exactly - whenever the toolbar is still resting
 *   normally.
 *
 * - Bottom toolbar's lift (applied as `translateY(-lift)`) =
 *   `max(0, windowInnerHeight - (panOffset + visualViewportHeight)) +
 *   gboardStripBuffer`, with the buffer only added when the raw gap is
 *   positive - no keyboard open must never produce a lift at all.
 */

export function computeTopToolbarTop(
  headerHeight: number,
  panOffset: number,
): number {
  return Math.max(headerHeight, panOffset)
}

export function computeWebViewMarginTop(params: {
  headerHeight: number
  topToolbarHeight: number
  panOffset: number
}): number {
  const {headerHeight, topToolbarHeight, panOffset} = params
  return topToolbarHeight + Math.max(0, panOffset - headerHeight)
}

export function computeBottomToolbarLift(params: {
  windowInnerHeight: number
  panOffset: number
  visualViewportHeight: number
  gboardStripBuffer: number
}): number {
  const {
    windowInnerHeight,
    panOffset,
    visualViewportHeight,
    gboardStripBuffer,
  } = params
  const rawGap = windowInnerHeight - (panOffset + visualViewportHeight)
  return rawGap > 0 ? rawGap + gboardStripBuffer : 0
}
