/**
 * Derives `site.standard.document`'s `textContent` (plain-text fallback,
 * "should not contain markdown or other formatting" per the lexicon) from a
 * raw `at.markpub.text.markdown` string. Deliberately scoped to exactly the
 * Article Compose toolbar's confirmed syntax surface (headings, bold,
 * italic, strikethrough, lists, blockquotes, links, code) rather than a
 * general CommonMark-AST-based stripper - matching this project's "build to
 * the toolbar's actual feature set, not the format's full surface"
 * principle. Underline/color/alignment carry no inline markdown syntax of
 * their own (they're pure facet metadata over plain text), so there's
 * nothing to strip for them; honorific Unicode codepoints and the U+200F
 * RTL mark are ordinary text and pass through untouched.
 */
export function deriveTextContentFromMarkdown(markdown: string): string {
  let text = markdown

  // Code fences (```lang\ncode\n```) -> code content only, fence lines dropped.
  text = text.replace(/```[^\n]*\n([\s\S]*?)```/g, '$1')

  // Blockquote markers (> ) at line start.
  text = text.replace(/^ {0,3}>\s?/gm, '')

  // List markers (-, *, +, or N.) at line start - stripped before inline
  // emphasis below, so a leading list-marker '*' or '-' can't accidentally
  // pair with an unrelated '*'/'-' elsewhere in the document.
  text = text.replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, '')

  // Headings (# Heading) -> Heading.
  text = text.replace(/^ {0,3}#{1,6}\s+/gm, '')

  // Inline code (`code`) -> code.
  text = text.replace(/`([^`\n]+)`/g, '$1')

  // Bold (**text** or __text__) -> text. Runs before italic - both use
  // overlapping characters, and content is restricted to a single line so an
  // unmatched marker elsewhere in the document can't be paired across lines.
  text = text.replace(/\*\*([^*\n]+)\*\*/g, '$1')
  text = text.replace(/__([^_\n]+)__/g, '$1')

  // Strikethrough (~~text~~) -> text.
  text = text.replace(/~~([^~\n]+)~~/g, '$1')

  // Italic (*text* or _text_) -> text.
  text = text.replace(/\*([^*\n]+)\*/g, '$1')
  text = text.replace(/_([^_\n]+)_/g, '$1')

  // Links ([text](url)) -> text. Images (![alt](url)) -> alt.
  text = text.replace(/!?\[([^\]\n]*)\]\([^)\n]*\)/g, '$1')

  return text.trim()
}
