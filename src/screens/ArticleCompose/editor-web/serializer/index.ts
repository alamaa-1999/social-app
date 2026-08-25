/**
 * `tiptap-markdown-fixed`, not the bare `@tiptap/markdown` - a pnpm alias
 * (`pnpm-workspace.yaml`) forcing a genuinely separate, correctly-resolved
 * v3 copy. The bare package name has only one physical instance anywhere
 * in this app's tree, and that instance's own peer dependency on
 * `@tiptap/core` resolves to this app's pre-existing v2 install (kept for
 * the unrelated web post-composer) - confirmed to be a real, live bug in
 * the actual Vite-built editor-web bundle, not a test-only artifact: the
 * real build fails outright with `"attrsEqual" is not exported by
 * "@tiptap/core"` the moment `@tiptap/markdown` is wired in bare. See
 * `Sunnahsky_Week3_Engineering_Notes.md`'s TipTap section for the full
 * account of why only an alias (not `packageExtensions`, not `overrides`)
 * fixes this specific case.
 */
import {decodeHtmlEntities} from 'tiptap-core-fixed'
import type {MarkdownManager} from 'tiptap-markdown-fixed'

import {byteSlice, type EditorFacet, utf8Length} from '../../state'
import {isAllowedColorValue} from '../../colorAllowlist'
import {HONORIFIC_CODEPOINTS} from '../../honorifics'
import {anchoredIndexOf} from './anchoredSearch'
import {sanitizeParsedDoc} from './sanitize'

/**
 * The bidirectional markdown+facets serializer (`concurrent-mixing-fern.md`'s
 * "single highest-risk component"). Full design history and the four review
 * rounds that shaped this exact implementation are in
 * `Sunnahsky_Week3_Engineering_Notes.md`'s TipTap section - this file is the
 * resolved design, not a fresh derivation.
 *
 * Bold/italic/strike/headings/lists/blockquote/links have real markdown
 * syntax and round-trip through `@tiptap/markdown`'s own default
 * serialization with zero custom code (confirmed via lexicon research: no
 * facet exists for any of them). Underline/color (span-level) and
 * typography/textAlign (block-level, on `paragraph`/`blockquote` nodes) have
 * no native syntax at all - this file's entire job is producing/consuming
 * the `com.sunnahsky.richtext.facets.*` metadata for exactly those four.
 */

interface JSONNode {
  type?: string
  attrs?: Record<string, unknown>
  content?: JSONNode[]
  marks?: Array<{type: string; attrs?: Record<string, unknown>}>
  text?: string
}

const TYPOGRAPHY_NODE_TYPES = new Set(['paragraph', 'blockquote'])
const DEFAULT_TEXT_ALIGN = 'left'

type BlockFeature =
  | {
      $type: 'com.sunnahsky.richtext.facets.blocks#typography'
      value: 'arabicParagraph' | 'arabicQuote'
    }
  | {
      $type: 'com.sunnahsky.richtext.facets.blocks#textAlign'
      value: 'left' | 'center' | 'right' | 'justify'
    }

type SpanFeature =
  | {$type: 'com.sunnahsky.richtext.facets.formatting#underline'}
  | {$type: 'com.sunnahsky.richtext.facets.formatting#color'; value: string}

interface CandidateSpan {
  /** The exact real substring to locate in the assembled markdown output. */
  substring: string
  facets: Array<BlockFeature | SpanFeature>
}

/**
 * `encodeTextForMarkdown` is a real method the manager already uses to
 * render every plain-text run - reused here rather than re-deriving
 * Markdown's escaping rules by hand, per this design's own review series.
 * TypeScript's `.d.ts` marks it `private` (an authoring-time API-surface
 * choice on the library's part, not a runtime restriction - the method is
 * an ordinary function on the class, callable like any other), so a single
 * narrow, documented cast stands in for it here instead of `any`.
 */
function encodeTextForMarkdown(
  manager: MarkdownManager,
  text: string,
  node: JSONNode,
  parent: JSONNode | undefined,
): string {
  const fn = (
    manager as unknown as {
      encodeTextForMarkdown: (t: string, n: JSONNode, p?: JSONNode) => string
    }
  ).encodeTextForMarkdown
  return fn.call(manager, text, node, parent)
}

/**
 * Exact inverse of `encodeTextForMarkdown` (`escapeMarkdownSyntax(
 * encodeHtmlEntities(text))`, confirmed directly against the installed
 * `@tiptap/markdown` source, `dist/index.js:1135-1137`:
 * `text.replace(/([\\`*_[\]~])/g, "\\$1")`).
 *
 * Real bug, found and fixed after a colleague's review ran the actual
 * serializer rather than just reading it: the load direction
 * (`applyFacetsToParsedDoc` below) was slicing a facet's stored byte range
 * out of the *raw, still-escaped* markdown string, then searching for that
 * raw slice inside the *parsed, already-unescaped* doc text - a search
 * that can never match for any faceted text containing a markdown-special
 * character (`\ * _ ~ \` [ ]`), since the parsed text never has the
 * backslash the raw slice does. Fail-closed caught it (the facet was
 * dropped, not corrupted), but this was systematic, not a rare edge case -
 * every underline/color facet on text containing one of those seven
 * characters would silently lose its formatting on the very next load.
 *
 * This is not a re-derivation of "markdown escaping" as a general concept
 * (the exact risk this design has already flagged and retired twice
 * elsewhere) - it is the mathematically exact inverse of one specific,
 * three-line, context-free regex read directly from the installed
 * library's source, composed with `decodeHtmlEntities`, a real function
 * `@tiptap/core` actually exports (confirmed: v2 doesn't have this
 * function at all, so it's imported from the `tiptap-core-fixed` alias,
 * not bare - the same class of gap this whole investigation was about).
 * Order matters and is the exact reverse of the encode order
 * (`escapeMarkdownSyntax` was applied *after* `encodeHtmlEntities` on
 * save, so it must be undone *before* it on load).
 *
 * Residual risk, stated plainly rather than assumed away: this stays
 * correct only as long as `escapeMarkdownSyntax`'s own character set
 * doesn't change in a future `@tiptap/markdown` release. Unlike a guessed-
 * at general rule, a change here isn't silent - the existing round-trip
 * property tests would fail immediately on any input containing whichever
 * character's behavior changed.
 */
function decodeMarkdownText(text: string): string {
  const unescaped = text.replace(/\\([\\`*_[\]~])/g, '$1')
  return decodeHtmlEntities(unescaped)
}

/**
 * Walks the doc in document order, collecting one `CandidateSpan` per
 * flagged block node or marked text run - never more than one search target
 * per node/run even when it carries multiple facets (a run with both
 * underline and color needs exactly one located range, applied to both),
 * so co-located facets share a single anchored search instead of
 * fighting over the shared cursor in `serializeToMarkdownAndFacets` below.
 * Recurses to any depth - typography/textAlign are valid on a
 * paragraph/blockquote nested inside a list item, not just at the top
 * level (the "block facets are easy, top-level only" framing this design
 * started with was corrected on review; this walk reflects the correction).
 */
function collectCandidateSpans(
  manager: MarkdownManager,
  node: JSONNode,
  parent: JSONNode | undefined,
  index: number,
  level: number,
  out: CandidateSpan[],
): void {
  if (node.type && TYPOGRAPHY_NODE_TYPES.has(node.type)) {
    const typography = node.attrs?.typography as
      'arabicParagraph' | 'arabicQuote' | undefined
    const textAlign = node.attrs?.textAlign as string | undefined
    const facets: CandidateSpan['facets'] = []
    if (typography) {
      facets.push({
        $type: 'com.sunnahsky.richtext.facets.blocks#typography',
        value: typography,
      })
    }
    if (textAlign && textAlign !== DEFAULT_TEXT_ALIGN) {
      facets.push({
        $type: 'com.sunnahsky.richtext.facets.blocks#textAlign',
        value: textAlign as 'left' | 'center' | 'right' | 'justify',
      })
    }
    if (facets.length > 0) {
      const substring = manager.renderNodeToMarkdown(
        node as never,
        parent as never,
        index,
        level,
      )
      if (substring) {
        out.push({substring, facets})
      }
    }
  }

  if (node.type === 'text' && node.marks?.length && node.text) {
    const facets: CandidateSpan['facets'] = []
    for (const mark of node.marks) {
      if (mark.type === 'underline') {
        facets.push({
          $type: 'com.sunnahsky.richtext.facets.formatting#underline',
        })
      }
      if (mark.type === 'textStyle' && typeof mark.attrs?.color === 'string') {
        const color = mark.attrs.color
        // Out-of-allowlist colors are silently excluded here, never
        // corrected/coerced - matches `colorAllowlist.ts`'s own fail-closed
        // convention. This isn't the facet-search fail-closed path (no
        // "drop and surface an error" here) because it isn't a search
        // failure - it's untrusted input that never should have reached
        // this far, caught the same way the renderer is required to.
        if (isAllowedColorValue(color)) {
          facets.push({
            $type: 'com.sunnahsky.richtext.facets.formatting#color',
            value: color,
          })
        }
      }
    }
    if (facets.length > 0) {
      const substring = encodeTextForMarkdown(manager, node.text, node, parent)
      if (substring) {
        out.push({substring, facets})
      }
    }
  }

  if (node.content) {
    node.content.forEach((child, childIndex) => {
      collectCandidateSpans(manager, child, node, childIndex, level + 1, out)
    })
  }
}

export interface SerializeResult {
  markdown: string
  facets: EditorFacet[]
  /**
   * Number of facets whose rendered substring couldn't be confidently
   * located in the final output and were dropped rather than guessed at -
   * the fail-closed requirement locked in by this design's security review.
   * Zero in the overwhelming common case. A non-zero result means real
   * content lost real formatting and should block publish with a visible
   * error, never be silently ignored by a caller.
   */
  droppedCount: number
}

/**
 * Save direction: ProseMirror doc (as JSON) -> markdown string + facets.
 * `search` is injectable (defaults to the real `anchoredIndexOf`) purely so
 * the fail-closed drop path - a facet whose real, correctly-rendered
 * substring genuinely can't be found - can be tested deterministically,
 * without needing to naturally provoke what should be a rare edge case in
 * correctly-functioning code. Production callers should never pass this.
 */
export function serializeToMarkdownAndFacets(
  manager: MarkdownManager,
  doc: JSONNode,
  search: typeof anchoredIndexOf = anchoredIndexOf,
): SerializeResult {
  const markdown = manager.serialize(doc as never)
  const spans: CandidateSpan[] = []
  collectCandidateSpans(manager, doc, undefined, 0, 0, spans)

  const facets: EditorFacet[] = []
  let droppedCount = 0
  let cursor = 0
  let approx = 0
  for (const span of spans) {
    const charIndex = search(markdown, span.substring, cursor, approx)
    if (charIndex === -1) {
      droppedCount += span.facets.length
      approx += span.substring.length
      continue
    }
    const byteStart = utf8Length(markdown.slice(0, charIndex))
    const byteEnd = byteStart + utf8Length(span.substring)
    for (const feature of span.facets) {
      facets.push({byteStart, byteEnd, feature})
    }
    cursor = charIndex + span.substring.length
    approx = cursor
  }

  return {markdown, facets, droppedCount}
}

/**
 * Recursively collects every `{parent, index}` pointing at a plain text
 * node, in document order - re-collected fresh after every applied facet in
 * `applyFacetsToParsedDoc` below, since splitting a text node to apply a
 * mark to part of it shifts later siblings' indices within the same
 * parent's `content` array. O(n^2) in the number of span facets - accepted,
 * since this runs once per article load, not on any hot path.
 */
function collectTextRuns(
  node: JSONNode,
  out: Array<{parent: JSONNode; index: number}>,
): void {
  if (!node.content) return
  node.content.forEach((child, index) => {
    if (child.type === 'text') {
      out.push({parent: node, index})
    } else {
      collectTextRuns(child, out)
    }
  })
}

/**
 * Every paragraph/blockquote in the freshly-parsed doc, document order, any
 * depth - deliberately over-inclusive (a plain paragraph with no typography
 * of its own is still collected), because unlike the save side's
 * `collectCandidateSpans` there is nothing on a freshly-parsed node yet to
 * filter on (`node.attrs.typography` doesn't exist until *after* this
 * facet's been applied - that's the whole point of this pass). Tracks
 * `parent`/`index`/`level` alongside each node, mirroring
 * `collectCandidateSpans`'s own recursion exactly, so
 * `manager.renderNodeToMarkdown` can be called on any candidate with the
 * same arguments the save side used to produce the facet's own stored
 * substring in the first place.
 */
function collectBlockNodeCandidates(
  node: JSONNode,
  parent: JSONNode | undefined,
  index: number,
  level: number,
  out: Array<{
    node: JSONNode
    parent: JSONNode | undefined
    index: number
    level: number
  }>,
): void {
  if (node.type && TYPOGRAPHY_NODE_TYPES.has(node.type)) {
    out.push({node, parent, index, level})
  }
  node.content?.forEach((child, childIndex) =>
    collectBlockNodeCandidates(child, node, childIndex, level + 1, out),
  )
}

function splitAndApplyMark(
  parent: JSONNode,
  index: number,
  matchStart: number,
  matchEnd: number,
  mark: {type: string; attrs?: Record<string, unknown>},
): void {
  const node = parent.content![index]
  const text = node.text ?? ''
  const before = text.slice(0, matchStart)
  const middle = text.slice(matchStart, matchEnd)
  const after = text.slice(matchEnd)
  const replacement: JSONNode[] = []
  if (before) {
    replacement.push({type: 'text', text: before, marks: node.marks})
  }
  replacement.push({
    type: 'text',
    text: middle,
    marks: [...(node.marks ?? []), mark],
  })
  if (after) {
    replacement.push({type: 'text', text: after, marks: node.marks})
  }
  parent.content!.splice(index, 1, ...replacement)
}

export interface DeserializeResult {
  doc: JSONNode
  /** Same fail-closed accounting as `SerializeResult.droppedCount`, for the
   * load direction: a stored facet whose exact source substring couldn't be
   * confidently re-located in the freshly-parsed document. */
  droppedCount: number
}

/**
 * Re-applies the `bidiIsolate` mark to every honorific glyph in a
 * freshly-parsed document.
 *
 * Deliberately derived, never persisted: the isolation is presentation, not
 * authored content, and it's a pure function of the codepoints already in
 * the text - so there is no facet, no lexicon field, and nothing on the
 * wire to version or validate. A document authored anywhere (including by
 * a non-Sunnahsky client, or by this app before `bridges/honorific.ts`
 * stopped writing invisible U+200F characters) gets correct isolation on
 * load purely from its own text.
 *
 * Splits per glyph rather than per run: honorifics are single codepoints
 * (all sixteen are in the Arabic Presentation Forms-A block, above the BMP
 * boundary only in the sense of being 3-byte UTF-8 - each is one UTF-16
 * code unit, so plain indexing is safe), and each wants its own isolate
 * rather than one isolate spanning intervening ordinary text.
 */
function applyHonorificIsolation(node: JSONNode): void {
  if (!node.content) return
  const next: JSONNode[] = []
  for (const child of node.content) {
    if (child.type !== 'text' || !child.text) {
      applyHonorificIsolation(child)
      next.push(child)
      continue
    }
    // Already isolated (a re-load of a document this app itself saved) -
    // leave it exactly as-is rather than nesting a second mark.
    if (child.marks?.some(m => m.type === 'bidiIsolate')) {
      next.push(child)
      continue
    }
    const text = child.text
    let buffer = ''
    let produced = false
    for (const ch of text) {
      const isHonorific = HONORIFIC_CODEPOINTS.has(ch.codePointAt(0) ?? -1)
      if (!isHonorific) {
        buffer += ch
        continue
      }
      if (buffer) {
        next.push({type: 'text', text: buffer, marks: child.marks})
        buffer = ''
      }
      next.push({
        type: 'text',
        text: ch,
        marks: [...(child.marks ?? []), {type: 'bidiIsolate'}],
      })
      produced = true
    }
    if (!produced) {
      // No honorific in this run - push the original node untouched rather
      // than an equal-but-rebuilt copy.
      next.push(child)
      continue
    }
    if (buffer) {
      next.push({type: 'text', text: buffer, marks: child.marks})
    }
  }
  node.content = next
}

/**
 * Load direction: markdown + facets -> doc. Structurally parses via the
 * manager's own default parse first (`manager.parse`) - correct list/
 * blockquote/heading handling for free - then applies each stored facet by
 * locating its own exact substring (sliced directly from the pristine
 * source at its own stored, trusted byte range - no ambiguity, unlike the
 * save direction there is no escaping uncertainty here at all) inside the
 * freshly-parsed doc, via the same anchored-search principle used on save,
 * applied to doc-position space instead of markdown-byte space.
 *
 * Divergence from this design's originally-reviewed plan, noted rather than
 * silently substituted: the plan called for reusing `manager.instance` (the
 * real configured MarkedJS lexer) for token-level byte-offset correlation.
 * This implementation uses the anchored-substring technique instead - the
 * same underlying principle (locate real, already-known-exact content;
 * never re-derive Markdown's structural/escaping rules by hand), applied to
 * doc positions rather than lexer tokens, and materially less code than a
 * full token-tree byte-accumulation walk. This has not yet been through the
 * same four-round review as the save direction above - flagged here as a
 * first implementation pass, not presented as equivalently vetted.
 */
/**
 * Guarantees the parsed document contains at least one block node.
 *
 * `manager.parse('')` returns `{type: 'doc', content: []}` - a document with
 * no paragraph at all - which is not a valid instance of this schema (`doc`
 * requires `block+`) and, more importantly, breaks the toolbar in a way that
 * looks like nothing happened. Confirmed by reproducing it against a real
 * `Editor` rather than by reading code: with a blockless doc,
 * `chain().clearNodes().updateAttributes('paragraph', ...)` walks
 * `nodesBetween` over a document with nothing in it, matches no node, and
 * silently succeeds having changed nothing. ProseMirror then creates a fresh
 * paragraph with *default* attributes on the first keypress, so the style the
 * author picked is discarded without any error. Selecting a style again once
 * that paragraph exists works normally - which is exactly why the bug only
 * ever showed up on the very first interaction with an empty editor, and was
 * reported as "I have to type something first, then it applies."
 *
 * Fixed at the load path rather than in the toolbar because this is the one
 * function every entry point shares - initial mount via `AdvancedEditor.tsx`
 * and every later `loadMarkdownAndFacets` call (switching drafts, and the
 * "clear composer" path, which produced the identical blockless doc).
 */
function ensureBlockContent(doc: JSONNode): void {
  if (!doc.content || doc.content.length === 0) {
    doc.content = [{type: 'paragraph'}]
  }
}

export function applyFacetsToParsedDoc(
  manager: MarkdownManager,
  markdown: string,
  facets: EditorFacet[],
): DeserializeResult {
  const doc = manager.parse(markdown) as JSONNode
  ensureBlockContent(doc)
  let droppedCount = 0

  const blockFacets = facets
    .filter(
      f =>
        f.feature.$type === 'com.sunnahsky.richtext.facets.blocks#typography' ||
        f.feature.$type === 'com.sunnahsky.richtext.facets.blocks#textAlign',
    )
    .sort((a, b) => a.byteStart - b.byteStart)
  const blockNodeCandidates: Array<{
    node: JSONNode
    parent: JSONNode | undefined
    index: number
    level: number
  }> = []
  collectBlockNodeCandidates(doc, undefined, 0, 0, blockNodeCandidates)
  // Monotonic, never-rewinding cursor over *candidates*, not a 1:1
  // assumption between facets and candidates - `blockNodeCandidates` is
  // deliberately over-inclusive (see its own doc comment), so a plain
  // paragraph with no facet of its own has to be *skippable*, not just
  // "the next one in line". Matched by exact string equality against the
  // facet's own stored byte range (via `byteSlice`, the same trusted-range
  // extraction the span-facet loop below uses) against
  // `manager.renderNodeToMarkdown`'s output for each candidate - both
  // sides are the *escaped* markdown representation (the facet's slice
  // comes directly from the published markdown; `renderNodeToMarkdown` is
  // the exact function that produced that same substring on the save
  // side), so this is a direct string comparison, no decode/encode
  // conversion needed the way the span-facet loop below requires.
  let candidateCursor = 0
  blockFacets.forEach((facet, i) => {
    const rawSlice = byteSlice(markdown, facet.byteStart, facet.byteEnd)
    if (!rawSlice) {
      droppedCount++
      return
    }
    let matched = false
    while (candidateCursor < blockNodeCandidates.length) {
      const candidate = blockNodeCandidates[candidateCursor]
      const rendered = manager.renderNodeToMarkdown(
        candidate.node as never,
        candidate.parent as never,
        candidate.index,
        candidate.level,
      )
      if (rendered !== rawSlice) {
        // Not this facet's node - either a facet-less eligible node
        // (a plain paragraph/blockquote with no typography/textAlign of
        // its own) or, in principle, one whose rendering doesn't match
        // for some other reason. Either way, skip it and keep looking -
        // never rewind, never guess.
        candidateCursor++
        continue
      }
      candidate.node.attrs = candidate.node.attrs ?? {}
      if (
        facet.feature.$type ===
        'com.sunnahsky.richtext.facets.blocks#typography'
      ) {
        candidate.node.attrs.typography = facet.feature.value
      } else {
        candidate.node.attrs.textAlign = facet.feature.value
      }
      matched = true
      const next = blockFacets[i + 1]
      // Only advance past this candidate once the *next* facet targets a
      // different byte range - two facets sharing a range (typography and
      // textAlign together) both apply to the same node.
      if (!next || next.byteStart !== facet.byteStart) {
        candidateCursor++
      }
      break
    }
    if (!matched) {
      droppedCount++
    }
  })

  const spanFacets = facets
    .filter(
      f =>
        f.feature.$type ===
          'com.sunnahsky.richtext.facets.formatting#underline' ||
        f.feature.$type === 'com.sunnahsky.richtext.facets.formatting#color',
    )
    .sort((a, b) => a.byteStart - b.byteStart)

  // Cross-facet monotonic position, in characters, over the concatenation
  // of every text run in document order - re-derived fresh each iteration
  // (since splitting a run to apply the previous facet's mark changes the
  // run list), but never rewound, so two facets targeting two different
  // occurrences of identical duplicate text each land on their own
  // occurrence rather than both matching the first one.
  let consumedChars = 0
  for (const facet of spanFacets) {
    const rawSlice = byteSlice(markdown, facet.byteStart, facet.byteEnd)
    if (!rawSlice) {
      droppedCount++
      continue
    }
    // Decode before searching - the stored byte range covers the *raw,
    // escaped* markdown, but the parsed doc's text nodes hold the already-
    // unescaped content. Searching with the raw slice directly can never
    // match for text containing a markdown-special character - see
    // `decodeMarkdownText`'s own doc comment for the full account of this
    // bug and why this specific fix is correct, not a re-guessed rule.
    const target = decodeMarkdownText(rawSlice)
    const runs: Array<{parent: JSONNode; index: number}> = []
    collectTextRuns(doc, runs)
    let charsWalked = 0
    let matched = false
    for (const run of runs) {
      const node = run.parent.content![run.index]
      const text = node.text ?? ''
      if (charsWalked + text.length <= consumedChars) {
        charsWalked += text.length
        continue
      }
      const searchStartInRun = Math.max(0, consumedChars - charsWalked)
      const idx = text.indexOf(target, searchStartInRun)
      if (idx === -1) {
        charsWalked += text.length
        continue
      }
      const mark =
        facet.feature.$type ===
        'com.sunnahsky.richtext.facets.formatting#underline'
          ? {type: 'underline'}
          : {type: 'textStyle', attrs: {color: facet.feature.value}}
      splitAndApplyMark(run.parent, run.index, idx, idx + target.length, mark)
      matched = true
      consumedChars = charsWalked + idx + target.length
      break
    }
    if (!matched) {
      droppedCount++
    }
  }

  // Strictly after facet correlation (it splits text nodes, which would
  // shift the positions the loops above walk) and strictly before
  // `sanitizeParsedDoc` (so anything it adds still passes through the
  // security gate rather than around it). The `bidiIsolate` mark it
  // applies carries no attributes, so it needs no `MARK_ATTR_ALLOWLIST`
  // entry and passes through sanitization untouched.
  applyHonorificIsolation(doc)

  // Sanitize last, strictly after all facet correlation above - see
  // `sanitize.ts`'s own doc comment for why this order is load-bearing,
  // not a style choice. `doc` has already served its purpose as the
  // correlation target by this point; nothing below reads byte offsets
  // against the source string again.
  sanitizeParsedDoc(doc)

  return {doc, droppedCount}
}
