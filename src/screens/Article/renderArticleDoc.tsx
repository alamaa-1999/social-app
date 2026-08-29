import {Fragment, type ReactNode} from 'react'
import {type StyleProp, Text, type TextStyle, View} from 'react-native'

import {isAllowedColorValue} from '#/screens/ArticleCompose/colorAllowlist'
import {ArticleImage} from './ArticleImage'

/** Mirrors `editor-web/serializer/index.ts`'s own `JSONNode` shape exactly - this
 * is the same tree `applyFacetsToParsedDoc` already produces for the composer's
 * own load path, walked here directly rather than re-declared as a shared type,
 * since `serializer/index.ts` lives inside the Vite-only `editor-web/` bundle
 * and this file is native-bundled - see the plan's own note on why that import
 * boundary is deliberate. */
interface JSONNode {
  type?: string
  attrs?: Record<string, unknown>
  content?: JSONNode[]
  marks?: Array<{type: string; attrs?: Record<string, unknown>}>
  text?: string
}

export type RenderArticleDocOptions = {
  /**
   * CID -> local file URI, for the pre-publish preview's own not-yet-tethered
   * images. Omitted entirely for the published reader.
   */
  localImageUris?: Record<string, string>
  /** Called when a `link` mark is tapped. No-op if omitted. */
  onPressLink?: (href: string) => void
}

/** Matches `serializer/index.ts`'s own default when no `textAlign` facet applies. */
const DEFAULT_TEXT_ALIGN = 'left' as const

/** U+00A0 - see `preventLastLineOrphan`'s own doc comment for why. */
const NON_BREAKING_SPACE = String.fromCharCode(160)

/**
 * `dir` never exists as a stored attribute on the wire - only `typography`/
 * `textAlign` survive the markdown/facet round trip (see
 * `applyFacetsToParsedDoc`). The live editor derives `dir` from `typography`
 * the same way, in `bridges/paragraphStyle.ts`'s own `SetParagraphStyle`
 * handler (`arabicParagraph`/`arabicQuote` -> `dir: 'rtl'`, nothing else) -
 * mirrored here rather than re-decided independently.
 */
function deriveWritingDirection(typography: unknown): 'rtl' | undefined {
  return typography === 'arabicParagraph' || typography === 'arabicQuote'
    ? 'rtl'
    : undefined
}

function textAlignOf(node: JSONNode): 'left' | 'right' | 'center' | 'justify' {
  const value = node.attrs?.textAlign
  return value === 'right' ||
    value === 'center' ||
    value === 'justify' ||
    value === 'left'
    ? value
    : DEFAULT_TEXT_ALIGN
}

/** Arabic, Arabic Supplement, Arabic Extended-A, and Arabic Presentation
 * Forms A/B - deliberately broad, since this is a fallback signal for real
 * Arabic prose, not a strict validator. Explicit `\uXXXX` escapes rather
 * than literal characters, so the exact codepoint boundaries stay
 * unambiguous and greppable rather than relying on invisible/lookalike
 * characters sitting directly in the source. */
const ARABIC_SCRIPT_RE =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/

/**
 * Whether a paragraph's own text is genuinely Arabic script - a direct
 * signal, used as a fallback alongside (never instead of) whatever facet
 * the editor itself set, since a facet can be absent on content this app
 * didn't author or didn't finish tagging (see `isVerse` below for the real
 * case this caught). Skips any `bidiIsolate`-marked leaf: those are
 * honorific ligatures (`honorifics.ts`, U+FD40-FDFF), which legitimately
 * appear inline inside otherwise-English paragraphs and say nothing about
 * the paragraph's own language - counting them here would flip an English
 * paragraph to Arabic styling just for containing one honorific.
 */
function containsArabicScript(nodes: JSONNode[]): boolean {
  return nodes.some(node => {
    if (node.type !== 'text' || typeof node.text !== 'string') return false
    if (node.marks?.some(mark => mark.type === 'bidiIsolate')) return false
    return ARABIC_SCRIPT_RE.test(node.text)
  })
}

/**
 * Which of the two spacing "buckets" `Sunnahsky_Design_System_Text_Styles.md`'s
 * own reader table cares about a top-level block belongs to - `undefined` for
 * anything the table doesn't cover yet (currently just images), which
 * deliberately gets no derived margin at all rather than a guessed one.
 *
 * Lists (`bulletList`/`orderedList`) count as `'text'`, same as paragraphs
 * and headings, even though the source doc never gave them their own
 * explicit value: leaving them uncategorized doesn't mean "no opinion, skip
 * it" the way it does for images - `gapAfterBlock` treats *any* uncategorized
 * neighbor as zero margin, which is a real, visible bug (a list bumping
 * straight into the next heading with no gap at all), not a small
 * discrepancy. The general 20 default is a reasonable placement until the
 * source doc gives lists their own real value, not a guess dressed up as one.
 */
function blockSpacingCategory(node: JSONNode): 'text' | 'quote' | undefined {
  if (
    node.type === 'paragraph' ||
    node.type === 'heading' ||
    node.type === 'bulletList' ||
    node.type === 'orderedList'
  ) {
    return 'text'
  }
  if (node.type === 'blockquote') return 'quote'
  return undefined
}

/** Mirrors `renderHeading`'s own level check exactly - level 2 is sub-heading-1, anything else is sub-heading-2. */
function isSubHeading2(node: JSONNode): boolean {
  return node.type === 'heading' && node.attrs?.level !== 2
}

function isSubHeading1(node: JSONNode): boolean {
  return node.type === 'heading' && node.attrs?.level === 2
}

/**
 * Gap between two adjacent top-level blocks, per
 * `Sunnahsky_Design_System_Text_Styles.md`'s "Reader" spacing table (decided
 * 2026-08-26, `quote-ar-verse` -> paragraph confirmed 28 by the owner
 * directly - the one value that doc itself left open).
 *
 * Re-derived for React Native, not ported verbatim: that table was designed
 * for *collapsing* CSS margins (the editor's WebView), where two touching
 * margins resolve to whichever is bigger. RN/Yoga margins sum instead - the
 * doc's own closing note flags this exact gap and explicitly declines to
 * re-derive it. Working through what the table's collapsed *results*
 * actually were (not its raw per-style numbers) collapses to one rule under
 * summing: every non-quote-to-non-quote pairing (heading<->heading,
 * heading<->paragraph, paragraph<->paragraph, Arabic or English) resolves to
 * 20 regardless of which two styles are adjacent - the doc verifies this
 * itself ("every heading/paragraph-adjacent boundary collapses to 20").
 * Every quote-to-quote pairing is *also* 20 (`quote-en`<->`quote-en`,
 * `quote-ar-verse`<->`quote-ar-verse`, and the one combination the doc
 * doesn't list, `quote-en`<->`quote-ar-verse`, by the same "consecutive
 * quotes default to 20" pattern the other two rows share). Only *crossing*
 * the quote/non-quote boundary, in either direction, is the elevated 28.
 * That leaves a single case unaccounted for here: `quote-ar-verse` ->
 * `quote-en` at 12, tighter than either 20 or 28 - but that's the verse
 * immediately followed by its own translation *inside one blockquote*, per
 * the doc's own framing ("in the same indented block"), not two separate
 * top-level blocks at all. It's already exactly what `quoteBlock`'s own
 * `gap: 12` below implements, independent of this function entirely.
 *
 * `sub-heading-2` is a deliberate, owner-specified exception to that clean
 * rule - 16 unconditionally, regardless of what follows it, overriding both
 * the 20 and 28 cases above.
 *
 * `sub-heading-1` gets a narrower, owner-specified exception: 16 only when
 * immediately followed by a paragraph or another heading (either level) -
 * not unconditional like sub-heading-2's own override, so a sub-heading-1
 * immediately before a blockquote still falls through to the general 28.
 *
 * Plain paragraph -> plain paragraph (English or Arabic body text, neither
 * side a heading) is also a deliberate owner-specified exception at 16,
 * tighter than the general 20 - two consecutive body paragraphs with no
 * heading between them.
 */
function gapAfterBlock(
  node: JSONNode,
  next: JSONNode | undefined,
): number | undefined {
  if (!next) return undefined
  if (isSubHeading2(node)) return 16
  if (
    isSubHeading1(node) &&
    (next.type === 'paragraph' || next.type === 'heading')
  ) {
    return 16
  }
  if (node.type === 'paragraph' && next.type === 'paragraph') return 16
  const a = blockSpacingCategory(node)
  const b = blockSpacingCategory(next)
  if (!a || !b) return undefined
  return a === b ? 20 : 28
}

type BlockGroup =
  {kind: 'single'; node: JSONNode} | {kind: 'quoteRun'; nodes: JSONNode[]}

/** The group's own first/last node - what `gapAfterBlock` needs to compute
 * the margin before and after it, regardless of whether it's one block or a
 * merged run of several. */
function firstNodeOf(group: BlockGroup): JSONNode {
  return group.kind === 'quoteRun' ? group.nodes[0] : group.node
}
function lastNodeOf(group: BlockGroup): JSONNode {
  return group.kind === 'quoteRun'
    ? group.nodes[group.nodes.length - 1]
    : group.node
}

/**
 * Collapses every run of consecutive top-level `blockquote` nodes into one
 * `quoteRun` group, so they render inside a single shared bordered wrapper
 * (see `renderQuoteRun`) instead of one independent border per node. Any
 * other node type stays its own `single` group, unchanged.
 */
function groupConsecutiveBlockquotes(nodes: JSONNode[]): BlockGroup[] {
  const groups: BlockGroup[] = []
  let i = 0
  while (i < nodes.length) {
    if (nodes[i].type === 'blockquote') {
      const run = [nodes[i]]
      let j = i + 1
      while (j < nodes.length && nodes[j].type === 'blockquote') {
        run.push(nodes[j])
        j++
      }
      groups.push({kind: 'quoteRun', nodes: run})
      i = j
    } else {
      groups.push({kind: 'single', node: nodes[i]})
      i++
    }
  }
  return groups
}

/**
 * Walks a parsed+facet-applied article document tree and produces plain RN
 * elements directly - no markdown re-parsing, no second correlation pass, no
 * external rendering library. See the plan's "Rendering engine" section for
 * why this is safe with no DOM/WebView involved at all.
 */
export function renderArticleDoc(
  doc: JSONNode,
  options: RenderArticleDocOptions = {},
): ReactNode {
  const groups = groupConsecutiveBlockquotes(doc.content ?? [])
  return (
    <>
      {groups.map((group, i) => {
        const next = groups[i + 1]
        const marginBottom = gapAfterBlock(
          lastNodeOf(group),
          next ? firstNodeOf(next) : undefined,
        )
        return (
          <View key={i} style={marginBottom ? {marginBottom} : undefined}>
            {group.kind === 'quoteRun'
              ? renderQuoteRun(group.nodes, options)
              : renderBlockNode(group.node, options)}
          </View>
        )
      })}
    </>
  )
}

function renderBlockNode(
  node: JSONNode,
  options: RenderArticleDocOptions,
): ReactNode {
  switch (node.type) {
    case 'paragraph':
      return renderParagraph(node, options)
    case 'heading':
      return renderHeading(node, options)
    case 'blockquote':
      return renderBlockquote(node, options)
    case 'bulletList':
      return renderList(node, options, 'bullet')
    case 'orderedList':
      return renderList(node, options, 'number')
    case 'image':
      return renderImage(node, options)
    case undefined:
      return null
    default:
      /*
       * Unknown node type policy, decided once rather than left to whatever
       * an unhandled switch case happens to do: render children, discard the
       * wrapper's own semantics. The public reader renders documents this
       * app didn't necessarily author (any Standard.site-compatible client
       * can write to a Sunnahsky-hosted repo), so a node type outside
       * `manager`'s registered set is genuinely reachable, not theoretical.
       */
      return (node.content ?? []).map((child, i) => (
        <Fragment key={i}>{renderBlockNode(child, options)}</Fragment>
      ))
  }
}

/**
 * Prevents a single-word orphan on a paragraph's own last wrapped line, by
 * replacing the space right before the final word with a non-breaking space
 * (U+00A0) - the last two words can then only ever wrap as a pair, never
 * split with one word left alone. This is the standard cross-platform
 * technique for this: RN's `Text` has no equivalent to CSS `text-wrap:
 * pretty`/`balance` on any platform, web included.
 *
 * Paragraph content is a flat array of inline leaves (`text`/`hardBreak`) -
 * marks live as a flat `marks[]` on a `text` leaf, never as wrapping nodes
 * (see `applyMarks`), so there's no deeper tree to walk here. Scans
 * backward from the end and stops at the first `hardBreak` it meets - that's
 * an author's own deliberate forced line break, not a wrapping artifact to
 * fix, so gluing words across it would be wrong. Within that final segment,
 * finds the first (from the end) text leaf containing a space - this
 * correctly reaches across a trailing mark change too (e.g. "...word2
 * **word3**": the space lives in the plain-text leaf right before the bold
 * one, not inside "word3" itself). If that segment turns out to be a single
 * word with no space anywhere in it, this is a deliberate no-op - not every
 * paragraph has two words to glue.
 */
function preventLastLineOrphan(content: JSONNode[]): JSONNode[] {
  let start = 0
  for (let i = content.length - 1; i >= 0; i--) {
    if (content[i].type === 'hardBreak') {
      start = i + 1
      break
    }
  }
  for (let i = content.length - 1; i >= start; i--) {
    const node = content[i]
    if (node.type === 'text' && typeof node.text === 'string') {
      const lastSpace = node.text.lastIndexOf(' ')
      if (lastSpace !== -1) {
        const fixed = [...content]
        fixed[i] = {
          ...node,
          text:
            node.text.slice(0, lastSpace) +
            NON_BREAKING_SPACE +
            node.text.slice(lastSpace + 1),
        }

        return fixed
      }
    }
  }
  return content
}

function renderParagraph(
  node: JSONNode,
  options: RenderArticleDocOptions,
): ReactNode {
  const typography = node.attrs?.typography
  const isArabic = typography === 'arabicParagraph'
  return (
    <Text
      style={[
        isArabic ? styles.bodyAr : styles.bodyEn,
        {
          textAlign: textAlignOf(node),
          writingDirection: deriveWritingDirection(typography),
        },
      ]}>
      {renderInline(preventLastLineOrphan(node.content ?? []), options)}
    </Text>
  )
}

function renderHeading(
  node: JSONNode,
  options: RenderArticleDocOptions,
): ReactNode {
  // `bridges/paragraphStyle.ts` only ever sets level 2 (sub-heading-1) or
  // level 3 (sub-heading-2) - anything else falls back to the smaller style
  // rather than guessing at a level this app's own composer never produces.
  const level = node.attrs?.level
  return (
    <Text style={level === 2 ? styles.subHeading1 : styles.subHeading2}>
      {renderInline(node.content ?? [], options)}
    </Text>
  )
}

/**
 * One blockquote's own paragraphs, without the bordered wrapper - split out
 * from `renderBlockquote` so `renderQuoteRun` (below) can share one wrapper,
 * and therefore one continuous left border, across several consecutive
 * blockquote nodes. `keyPrefix` namespaces keys across nodes sharing that
 * one wrapper, so two different blockquotes' own paragraph indices (both
 * starting at 0) never collide as React siblings.
 */
function renderBlockquoteContent(
  node: JSONNode,
  options: RenderArticleDocOptions,
  keyPrefix: string,
): ReactNode {
  const isArabicQuote = node.attrs?.typography === 'arabicQuote'
  return (node.content ?? []).map((child, i) => {
    const key = `${keyPrefix}-${i}`
    if (child.type !== 'paragraph') {
      return <Fragment key={key}>{renderBlockNode(child, options)}</Fragment>
    }
    /*
     * `paragraphStyle.ts`'s own insert-time behavior sets `typography:
     * 'arabicQuote'` on the *blockquote*, but `textAlign: 'center'` only
     * on the paragraph that's actually the Arabic verse - a later
     * English translation paragraph appended below it never gets that
     * attribute. `textAlign === 'center'` inside an `arabicQuote`
     * blockquote was meant to be the real, persisted signal for "this
     * specific paragraph is the verse, not the translation" - not
     * position, and not a `typography` value that was never set
     * per-paragraph in the first place.
     *
     * In practice that facet doesn't reliably exist: real, already-saved
     * articles have `typography: arabicQuote` on the blockquote and no
     * per-paragraph `textAlign` facet at all (confirmed directly against
     * a live article's own stored record), so `textAlign === 'center'`
     * alone left the actual Arabic verse falling through to `quoteEn`.
     * `containsArabicScript` is a fallback, not a replacement - it
     * doesn't depend on any facet surviving the save/load round trip,
     * only on the paragraph's own text actually being Arabic.
     */
    const isVerse =
      isArabicQuote &&
      (textAlignOf(child) === 'center' ||
        containsArabicScript(child.content ?? []))
    /*
     * The verse is centered unconditionally by design (Figma's own spec
     * for it), not read off `textAlign` - the same missing-facet gap
     * `isVerse` above already works around. Reading it off the facet
     * here too would just reintroduce the identical bug for alignment
     * that `containsArabicScript` already fixed for font selection.
     */
    return (
      <Text
        key={key}
        style={[
          isVerse ? styles.quoteAr : styles.quoteEn,
          {
            textAlign: isVerse ? 'center' : textAlignOf(child),
            writingDirection: isVerse ? 'rtl' : undefined,
          },
        ]}>
        {renderInline(child.content ?? [], options)}
      </Text>
    )
  })
}

function renderBlockquote(
  node: JSONNode,
  options: RenderArticleDocOptions,
): ReactNode {
  return (
    <View style={styles.quoteBlock}>
      {renderBlockquoteContent(node, options, 'q')}
    </View>
  )
}

/**
 * Several consecutive top-level blockquote nodes, sharing one bordered
 * container so the left border reads as one continuous line down the whole
 * group (Figma's own quote block is one border around potentially-several
 * paragraphs; two separate blockquote nodes placed back to back in the
 * source document are visually the same thing - a longer quoted passage
 * split into blocks, not two unrelated quotes that happen to be adjacent).
 */
function renderQuoteRun(
  nodes: JSONNode[],
  options: RenderArticleDocOptions,
): ReactNode {
  return (
    <View style={styles.quoteBlock}>
      {nodes.flatMap((node, qi) =>
        renderBlockquoteContent(node, options, `q${qi}`),
      )}
    </View>
  )
}

function renderList(
  node: JSONNode,
  options: RenderArticleDocOptions,
  kind: 'bullet' | 'number',
): ReactNode {
  const items = node.content ?? []
  return (
    <View style={styles.list}>
      {items.map((item, i) => (
        <View key={i} style={styles.listItemRow}>
          <Text style={styles.listMarker}>
            {kind === 'bullet' ? '•' : `${i + 1}.`}
          </Text>
          <View style={styles.listItemContent}>
            {(item.content ?? []).map((child, j) => (
              <Fragment key={j}>
                {child.type === 'paragraph' ? (
                  <Text style={styles.listText}>
                    {renderInline(child.content ?? [], options)}
                  </Text>
                ) : (
                  renderBlockNode(child, options)
                )}
              </Fragment>
            ))}
          </View>
        </View>
      ))}
    </View>
  )
}

function renderImage(
  node: JSONNode,
  options: RenderArticleDocOptions,
): ReactNode {
  const src = node.attrs?.src
  if (typeof src !== 'string') return null
  return (
    <ArticleImage
      src={src}
      alt={typeof node.attrs?.alt === 'string' ? node.attrs.alt : undefined}
      localImageUris={options.localImageUris}
    />
  )
}

function renderInline(
  nodes: JSONNode[],
  options: RenderArticleDocOptions,
): ReactNode {
  return nodes.map((node, i) => {
    if (node.type === 'text') {
      return (
        <Fragment key={i}>
          {applyMarks(node.text ?? '', node.marks ?? [], options)}
        </Fragment>
      )
    }
    if (node.type === 'hardBreak') {
      return <Text key={i}>{'\n'}</Text>
    }
    // Unknown inline node type: same policy as block level - render nothing
    // rather than an unhandled node's raw text falling through incorrectly,
    // since an inline node with no recognized shape has no safe fallback
    // rendering the way a block wrapper's children do.
    return null
  })
}

function applyMarks(
  text: string,
  marks: Array<{type: string; attrs?: Record<string, unknown>}>,
  options: RenderArticleDocOptions,
): ReactNode {
  return marks.reduce<ReactNode>((child, mark) => {
    switch (mark.type) {
      case 'bold':
        return <Text style={styles.bold}>{child}</Text>
      case 'italic':
        return <Text style={styles.italic}>{child}</Text>
      case 'strike':
        return <Text style={styles.strike}>{child}</Text>
      case 'underline':
        return <Text style={styles.underline}>{child}</Text>
      case 'textStyle': {
        // Color lives on the shared `textStyle` mark's own `color` attribute,
        // not a standalone `color` mark - matches exactly how
        // `serializer/index.ts` itself both reads (`applyFacetsToParsedDoc`)
        // and writes it. Re-validated here, not trusted as already-safe: the
        // composer's own `onSetColor` already enforces `isAllowedColorValue`
        // at insertion time, but this is the first consumer that can see a
        // `color` value from a source that never went through that check -
        // a foreign document, or a tampered one.
        const color = mark.attrs?.color
        if (typeof color === 'string' && isAllowedColorValue(color)) {
          return <Text style={{color}}>{child}</Text>
        }
        return child
      }
      case 'link': {
        const href = mark.attrs?.href
        if (typeof href !== 'string') return child
        return (
          <Text style={styles.link} onPress={() => options.onPressLink?.(href)}>
            {child}
          </Text>
        )
      }
      case 'bidiIsolate':
        /*
         * Every honorific glyph is an Arabic Presentation Forms-A ligature
         * (U+FD40-FDFF, see `honorifics.ts`) with no coverage in Vollkorn or
         * Archivo - and most honorifics appear inline inside plain English
         * paragraphs (e.g. "Ibn Taymiyah ﵀"), not inside an
         * `arabicParagraph`/`arabicQuote` block. A bare pass-through left
         * the glyph inheriting the enclosing paragraph's own font, which
         * has no glyph for it, so the browser silently substituted its own
         * per-character fallback for just that one character. Scheherazade
         * New is the one font this app ships that actually covers this
         * block, so it's pinned here explicitly rather than left to
         * whatever font the surrounding text happens to use. Font size,
         * line height, and color intentionally aren't touched - those
         * still inherit from the enclosing Text so the glyph sits at the
         * same scale and ink color as the text around it.
         *
         * Bidi positioning itself is left alone - RN's text layout already
         * runs the platform's own bidi algorithm, and only the font was
         * ever actually missing.
         */
        return <Text style={styles.honorific}>{child}</Text>
      default:
        // Unknown mark type: same policy as unknown node types - pass the
        // text through unstyled rather than dropping it, since an
        // unrecognized mark on real content from another Standard.site
        // client is reachable, not theoretical.
        return child
    }
  }, text)
}

const styles = {
  bodyEn: {
    fontFamily: 'Vollkorn',
    fontSize: 18,
    lineHeight: 18 * 1.7,
    color: '#232e3e',
  } satisfies StyleProp<TextStyle>,
  bodyAr: {
    fontFamily: 'Scheherazade New',
    fontSize: 20,
    lineHeight: 20 * 2,
    color: '#000000',
  } satisfies StyleProp<TextStyle>,
  subHeading1: {
    fontFamily: 'Archivo SemiBold',
    fontSize: 32,
    lineHeight: 32 * 1.4,
    color: '#232e3e',
  } satisfies StyleProp<TextStyle>,
  subHeading2: {
    fontFamily: 'Archivo SemiBold',
    fontSize: 24,
    lineHeight: 24 * 1.25,
    color: '#232e3e',
  } satisfies StyleProp<TextStyle>,
  quoteBlock: {
    borderLeftWidth: 2,
    borderLeftColor: '#a2845e',
    paddingLeft: 20,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 12,
  },
  quoteAr: {
    fontFamily: 'Scheherazade New',
    fontSize: 18,
    lineHeight: 18 * 2.1,
    color: '#232e3e',
  } satisfies StyleProp<TextStyle>,
  quoteEn: {
    fontFamily: 'Vollkorn',
    fontSize: 17,
    lineHeight: 17 * 1.6,
    color: '#232e3e',
  } satisfies StyleProp<TextStyle>,
  list: {
    gap: 4,
  },
  listItemRow: {
    flexDirection: 'row' as const,
    // Matches the design's `ms-[27px]` on each `<li>` - a logical, RTL-safe
    // start margin on the whole marker+text row, not a fixed left margin.
    marginStart: 27,
  },
  listMarker: {
    fontFamily: 'Vollkorn',
    fontSize: 18,
    lineHeight: 18 * 1.55,
    color: '#232e3e',
    // Logical, RTL-safe spacing to match `ms-[27px]` in the design - a fixed
    // `marginRight` would sit on the wrong side inside a right-to-left list.
    marginEnd: 8,
  } satisfies StyleProp<TextStyle>,
  listItemContent: {
    flex: 1,
  },
  listText: {
    fontFamily: 'Vollkorn',
    fontSize: 18,
    lineHeight: 18 * 1.55,
    color: '#232e3e',
  } satisfies StyleProp<TextStyle>,
  bold: {fontWeight: 'bold' as const},
  italic: {fontStyle: 'italic' as const},
  strike: {textDecorationLine: 'line-through' as const},
  underline: {textDecorationLine: 'underline' as const},
  link: {color: '#0059d6', textDecorationLine: 'underline' as const},
  honorific: {
    fontFamily: 'Scheherazade New',
  } satisfies StyleProp<TextStyle>,
}
