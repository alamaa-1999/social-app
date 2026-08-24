/**
 * Locates `needle` - an exact, already-rendered substring captured directly
 * from the real library output, never a re-derived guess - inside
 * `haystack`, starting the search at `Math.max(cursor, approxIndex)`.
 *
 * `cursor` is the caller's own monotonically-advancing "already consumed up
 * to here" position (0 until the first successful match, then the end of
 * the previous match) - it guarantees an earlier occurrence of duplicate
 * text is never re-matched. `approxIndex` is a running length-based
 * estimate that is always a valid lower bound on the true position (it only
 * ever omits glue bytes - separators, indentation - that the real output
 * adds and this estimate doesn't know about; it can never overshoot) - it
 * guards the case `cursor` alone can't: disambiguating a duplicate that
 * appears *before* the very first successful match, when `cursor` is still
 * 0. Combining both is deliberately more robust than either alone, per the
 * anchored-search design (see `Sunnahsky_Week3_Engineering_Notes.md`'s
 * TipTap serializer section).
 *
 * Literal substring search only (`String.prototype.indexOf`) - never a
 * regex built from `needle`. A regex would reintroduce both a correctness
 * bug (unescaped regex metacharacters occurring naturally in prose) and a
 * ReDoS surface this design otherwise avoids entirely, since `needle` here
 * is real, arbitrary user content, not a fixed pattern.
 *
 * Returns the character index of the match start (JS/UTF-16 units, the same
 * units `indexOf` and `.length` use throughout this file), or -1 if
 * `needle` occurs nowhere at or after the anchor - the caller's fail-closed
 * responsibility is to treat -1 as "drop this facet, don't guess," never to
 * fall back to an earlier/closest match.
 */
export function anchoredIndexOf(
  haystack: string,
  needle: string,
  cursor: number,
  approxIndex: number,
): number {
  if (needle.length === 0) {
    return -1
  }
  return haystack.indexOf(needle, Math.max(cursor, approxIndex, 0))
}
