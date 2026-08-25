/*
 * Preparing a picked file's name for display.
 *
 * A filename is text this app did not author - whoever produced the file chose
 * it - so it gets the same treatment as any other untrusted string before it
 * reaches a screen.
 *
 * This is deliberately one shared helper rather than a rule written next to
 * each call site. Today the only consumer is the article composer's body-image
 * placeholder, inside the editor WebView. It will not be the only one: a cover
 * image equivalent, a drafts list and a media manager would all display the
 * same value, and a rule that lives in a comment beside one node view is a rule
 * a new surface can quietly skip. Render through `displayFileName` and the
 * rules travel with it.
 *
 * Two rules, of deliberately different weight - see each function.
 */

/*
 * Bidi formatting and isolate controls. These reorder everything after them,
 * which is why they cannot survive into a rendered filename.
 * https://www.unicode.org/reports/tr9/#Directional_Formatting_Characters
 */
const BIDI_CONTROLS = /[\u202A-\u202E\u2066-\u2069\u200E\u200F\u061C]/g

/*
 * C0 and C1 control characters plus the Unicode line and paragraph
 * separators. Written as escape sequences rather than literal bytes so the
 * source stays readable and cannot be silently mangled in transit.
 */
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g

const DEFAULT_MAX_LENGTH = 32
const ELLIPSIS = '…'

/**
 * Strips characters that must never reach a rendered filename.
 *
 * **This is display correctness, not a security boundary.** The often-cited
 * risk is that U+202E makes `photo<RLO>gnp.js` read as `photo.js.png`,
 * disguising an executable as an image - but nothing in this app acts on a
 * filename. It is printed and nothing more, so there is no click-to-open to be
 * fooled by. The real reason is duller: a stray direction-flipping character
 * bleeds into the surrounding layout and garbles the block it sits in, which is
 * precisely the failure that took a task to fix in this editor's RTL work.
 *
 * The actual security rule cannot live in a string function: **render this as
 * text, never as markup** - `textContent` rather than `innerHTML` in the
 * WebView, a `<Text>` child in React Native. A file named
 * `<img src=x onerror="…">.jpg` would otherwise execute inside the editor and
 * could rewrite the article being composed.
 */
export function sanitizeFileName(name: string): string {
  return name
    .replace(BIDI_CONTROLS, '')
    .replace(CONTROL_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Shortens a filename for display, keeping the extension legible.
 *
 * Elides the middle rather than the tail so the extension survives - it is
 * usually the most informative part left once a name is too long to read, and
 * in the composer's placeholder it is what tells the author whether they picked
 * the JPEG or the PNG. `a-very-long-photo-name….jpg`, never
 * `a-very-long-photo-n…`.
 *
 * An extension is only treated as one if it is short and actually looks like a
 * suffix, so a dotted name without a real extension - `2024.10.report` - is
 * truncated as a plain string rather than having `.report` preserved as if it
 * were meaningful.
 */
export function truncateFileName(
  name: string,
  maxLength = DEFAULT_MAX_LENGTH,
): string {
  if (name.length <= maxLength) return name

  const dot = name.lastIndexOf('.')
  const hasExtension = dot > 0 && dot > name.length - 8 && dot < name.length - 1
  const extension = hasExtension ? name.slice(dot) : ''
  const stem = hasExtension ? name.slice(0, dot) : name

  // Not enough room to show anything meaningful alongside the extension - fall
  // back to a plain head truncation rather than emitting mostly-ellipsis.
  const budget = maxLength - extension.length - ELLIPSIS.length
  if (budget < 4) return name.slice(0, Math.max(1, maxLength - 1)) + ELLIPSIS

  const head = Math.ceil(budget / 2)
  const tail = Math.floor(budget / 2)
  return (
    stem.slice(0, head) + ELLIPSIS + stem.slice(stem.length - tail) + extension
  )
}

/**
 * The one function display surfaces should call: sanitised, then truncated.
 *
 * Returns `undefined` for a missing name, and also for one that sanitises down
 * to nothing - a name made entirely of control characters would otherwise
 * render as an empty gap that looks like a bug. Callers fall back to their own
 * copy in that case rather than showing a blank.
 */
export function displayFileName(
  name: string | null | undefined,
  maxLength = DEFAULT_MAX_LENGTH,
): string | undefined {
  if (!name) return undefined
  const clean = sanitizeFileName(name)
  if (!clean) return undefined
  return truncateFileName(clean, maxLength)
}
