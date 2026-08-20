/**
 * Pure text + facet manipulation for the article body editor. Phase 2a
 * decided plain text buffer + toolbar string manipulation, not a WYSIWYG
 * layer (`articles client ui plan.md`'s decision 4) - this is that
 * manipulation layer.
 *
 * Two kinds of formatting, handled differently:
 * - Native markdown syntax (bold `**`, italic `*`, strikethrough `~~`,
 *   headings `#`, lists) is literal characters inserted into the buffer -
 *   `wrapSelection`/`insertLinePrefix` below.
 * - Custom facets (underline, color, alignment - `com.sunnahsky.richtext.
 *   facets.*`, Phase 2a) carry no syntax of their own; they're metadata
 *   over a byte range of otherwise-plain text - `addFacet` below.
 *
 * All positions are UTF-8 byte offsets, matching the lexicon's own
 * `byteStart`/`byteEnd` convention (not JS's native UTF-16 string
 * indices) - a real distinction for this app specifically, since Arabic
 * honorific text is a first-class case, not an edge case. `insertText`/
 * `deleteRange` below mirror `@bsky/sdk/richtext`'s own `RichText.insert`/
 * `.delete` facet-shifting logic (same three-scenario shift rules: before,
 * inside, after), with one deliberate correction: the shift amount is
 * computed from the actual UTF-8 byte length of the inserted text, not
 * its UTF-16 `.length` - `RichText.insert()` uses `.length`, which is only
 * correct for ASCII insertions (fine for its own mentions/links/tags use
 * case, not fine here).
 */

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export function utf8Length(text: string): number {
  return encoder.encode(text).byteLength
}

function byteSlice(markdown: string, start: number, end?: number): string {
  return decoder.decode(encoder.encode(markdown).slice(start, end))
}

export interface EditorFacet {
  byteStart: number
  byteEnd: number
  feature: FacetFeature
}

export type FacetFeature =
  | {$type: 'com.sunnahsky.richtext.facets.formatting#underline'}
  | {$type: 'com.sunnahsky.richtext.facets.formatting#color'; value: string}
  | {
      $type: 'com.sunnahsky.richtext.facets.blocks#textAlign'
      value: 'left' | 'center' | 'right' | 'justify'
    }

export interface EditorState {
  markdown: string
  facets: EditorFacet[]
}

/**
 * Inserts `text` at `byteIndex`, shifting every facet's byte range
 * accordingly - facets entirely before the insertion point are untouched,
 * facets entirely at/after it shift forward by the inserted byte length,
 * and facets that span the insertion point grow to include it.
 */
export function insertText(
  state: EditorState,
  byteIndex: number,
  text: string,
): EditorState {
  const markdown =
    byteSlice(state.markdown, 0, byteIndex) +
    text +
    byteSlice(state.markdown, byteIndex)
  const numBytesAdded = utf8Length(text)
  if (!state.facets.length) {
    return {markdown, facets: state.facets}
  }
  const facets = state.facets.map(f => {
    if (byteIndex <= f.byteStart) {
      return {
        ...f,
        byteStart: f.byteStart + numBytesAdded,
        byteEnd: f.byteEnd + numBytesAdded,
      }
    }
    if (byteIndex > f.byteStart && byteIndex < f.byteEnd) {
      return {...f, byteEnd: f.byteEnd + numBytesAdded}
    }
    return f
  })
  return {markdown, facets}
}

/**
 * Removes the byte range `[byteStart, byteEnd)`, shifting/shrinking facets
 * accordingly. A facet entirely inside the removed range is dropped; a
 * facet that partially overlaps is clipped to what survives.
 */
export function deleteRange(
  state: EditorState,
  byteStart: number,
  byteEnd: number,
): EditorState {
  const markdown =
    byteSlice(state.markdown, 0, byteStart) + byteSlice(state.markdown, byteEnd)
  const numBytesRemoved = byteEnd - byteStart
  const facets = state.facets
    .map(f => {
      // Entirely inside the removed range - drop it.
      if (byteStart <= f.byteStart && byteEnd >= f.byteEnd) {
        return null
      }
      // Entirely before the removed range - untouched.
      if (byteEnd <= f.byteStart) {
        return {
          ...f,
          byteStart: f.byteStart - numBytesRemoved,
          byteEnd: f.byteEnd - numBytesRemoved,
        }
      }
      // Entirely after the removed range - untouched.
      if (byteStart >= f.byteEnd) {
        return f
      }
      // Partial overlap - clip to what survives.
      const newStart = byteStart <= f.byteStart ? byteStart : f.byteStart
      const newEnd =
        byteEnd >= f.byteEnd ? byteStart : f.byteEnd - numBytesRemoved
      return {...f, byteStart: newStart, byteEnd: newEnd}
    })
    .filter((f): f is EditorFacet => f !== null && f.byteStart < f.byteEnd)
  return {markdown, facets}
}

/**
 * Wraps the byte range `[selStart, selEnd)` in `before`/`after` markup
 * (e.g. `**`/`**` for bold, `~~`/`~~` for strikethrough) by inserting each
 * marker as a separate `insertText` call, so existing facets shift
 * correctly around both insertions. Returns the new selection range
 * (still wrapping the original text, now offset by `before`'s length).
 */
export function wrapSelection(
  state: EditorState,
  selStart: number,
  selEnd: number,
  before: string,
  after: string,
): {state: EditorState; selStart: number; selEnd: number} {
  const afterInner = insertText(state, selEnd, after)
  const afterBoth = insertText(afterInner, selStart, before)
  const beforeLen = utf8Length(before)
  return {
    state: afterBoth,
    selStart: selStart + beforeLen,
    selEnd: selEnd + beforeLen,
  }
}

/** Inserts `prefix` at the start of the line containing `byteIndex` (headings, list markers). */
export function insertLinePrefix(
  state: EditorState,
  byteIndex: number,
  prefix: string,
): EditorState {
  const decoded = decoder.decode(encoder.encode(state.markdown))
  const upToIndex = byteSlice(state.markdown, 0, byteIndex)
  const lineStartChar = upToIndex.lastIndexOf('\n') + 1
  const lineStartByte = utf8Length(decoded.slice(0, lineStartChar))
  return insertText(state, lineStartByte, prefix)
}

/** Records a custom facet (underline/color/alignment) over an existing byte range - no text is inserted. */
export function addFacet(
  state: EditorState,
  byteStart: number,
  byteEnd: number,
  feature: FacetFeature,
): EditorState {
  return {
    markdown: state.markdown,
    facets: [...state.facets, {byteStart, byteEnd, feature}],
  }
}

/** Converts recorded editor facets into the wire shape `at.markpub.text.facets` expects. */
export function facetsToWireFormat(facets: EditorFacet[]) {
  return facets.map(f => {
    const $type =
      f.feature.$type === 'com.sunnahsky.richtext.facets.blocks#textAlign'
        ? 'com.sunnahsky.richtext.facets.blocks'
        : 'com.sunnahsky.richtext.facets.formatting'
    return {
      $type,
      index: {byteStart: f.byteStart, byteEnd: f.byteEnd},
      features: [f.feature],
    }
  })
}
