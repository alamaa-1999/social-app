/**
 * Sanitizes a freshly-parsed document *after* facet correlation has
 * already run against the pristine source string - never before, and
 * never touching the source string itself. This ordering is load-bearing,
 * not a style choice: `applyFacetsToParsedDoc` correlates a facet's stored
 * byte range against the original markdown string's bytes; sanitizing that
 * string first (stripping or altering characters) would silently shift or
 * invalidate every offset downstream of the change, corrupting the exact
 * correctness the anchored-search design exists to guarantee. Sanitizing
 * the *parsed doc* instead has nothing to do with string positions at all,
 * so the two concerns never interact - see `Sunnahsky_Week3_Engineering_
 * Notes.md`'s TipTap section for the full account of why this sequencing
 * was chosen deliberately, not assumed safe.
 *
 * Confirmed empirically, not assumed, against this exact extension set
 * (`Document`/`Paragraph`/`Text`/`Bold`/`Italic`/`Strike`/`Blockquote`/
 * `Underline`/`TextStyle`/`Color`/`Heading`/`Link`/`BulletList`/
 * `ListItem`/`Image`), run under a real `DOMParser` (jsdom - `manager.
 * parse`'s HTML path is a silent, safe no-op under Jest's default
 * environment, since `@tiptap/markdown`'s own `parseHTMLToken` falls back
 * to inert literal text whenever `window.DOMParser` is unavailable at all
 * - a real DOMParser is required for this to test anything meaningful):
 * - `<script>...</script>` is dropped entirely by ProseMirror's own
 *   schema-driven DOM parsing - no schema node type matches it, so both
 *   the tag and its content vanish, never executed, never preserved as
 *   markup or text.
 * - `<img onerror="...">` becomes a real `image` node whose `attrs` never
 *   contain `onerror` at all - `@tiptap/extension-image`'s own schema
 *   only ever declares `src`/`alt`/`title`/`width`/`height`, so ProseMirror
 *   never asks the DOM for anything else.
 * - `<a href="javascript:...">` loses its link mark entirely (text
 *   survives as plain text) - `@tiptap/extension-link`'s own `isAllowedUri`
 *   check rejects the parse rule for disallowed protocols before the mark
 *   is ever created.
 *
 * So the current schema is already safe by construction, without this
 * file existing at all. This file is deliberate defense-in-depth on top of
 * that, not a gap being closed: an explicit, narrow attribute allowlist so
 * a *future* extension addition (a new node/mark admitting a wider
 * attribute set, or a future TipTap/marked version behaving differently)
 * can't silently reopen this by relying only on upstream library behavior
 * with no local enforcement - consistent with this project's own
 * established fail-closed/allowlist convention elsewhere (`colorAllowlist.
 * ts`'s own doc comment makes the identical argument for facet color
 * values). It also does not depend on jsdom and a real WebView's DOMParser
 * continuing to behave identically forever.
 */

interface JSONNode {
  type?: string
  attrs?: Record<string, unknown>
  content?: JSONNode[]
  marks?: Array<{type: string; attrs?: Record<string, unknown>}>
  text?: string
}

const ALLOWED_URL_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'tel:'])

function isAllowedUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value) return false
  try {
    // A base is required for scheme-relative/relative strings to parse at
    // all; only the resulting scheme is ever inspected, the base itself
    // never ends up in the result.
    const scheme = new URL(value, 'https://example.invalid').protocol
    return ALLOWED_URL_SCHEMES.has(scheme)
  } catch {
    return false
  }
}

/** Node type -> allowed attribute keys. Anything else is dropped outright. */
const NODE_ATTR_ALLOWLIST: Record<string, string[]> = {
  image: ['src', 'alt', 'title', 'width', 'height'],
}

/** Mark type -> allowed attribute keys. */
const MARK_ATTR_ALLOWLIST: Record<string, string[]> = {
  link: ['href', 'target', 'rel', 'class', 'title'],
}

/** Attribute keys, on any node/mark type, whose value must be a safe URL scheme. */
const URL_ATTR_KEYS = new Set(['src', 'href'])

function sanitizeAttrs(
  attrs: Record<string, unknown> | undefined,
  allowlist: string[] | undefined,
): Record<string, unknown> | undefined {
  if (!attrs) return attrs
  const allowed = new Set(allowlist ?? [])
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(attrs)) {
    if (allowlist && !allowed.has(key)) continue
    // Defense-in-depth beyond the allowlist itself: even an explicitly
    // allowed key never carries an event-handler-shaped name (`onerror`,
    // `onload`, etc.) or a dangerous URL scheme.
    if (/^on/i.test(key)) continue
    if (URL_ATTR_KEYS.has(key) && !isAllowedUrl(value)) continue
    result[key] = value
  }
  return result
}

/** Recursively sanitizes a parsed document in place and returns it. */
export function sanitizeParsedDoc<T extends JSONNode>(doc: T): T {
  walk(doc)
  return doc
}

function walk(node: JSONNode): void {
  if (node.attrs) {
    const allowlist = node.type ? NODE_ATTR_ALLOWLIST[node.type] : undefined
    node.attrs = sanitizeAttrs(node.attrs, allowlist)
  }
  if (node.marks) {
    node.marks = node.marks.map(mark => ({
      ...mark,
      attrs: sanitizeAttrs(mark.attrs, MARK_ATTR_ALLOWLIST[mark.type]),
    }))
  }
  node.content?.forEach(walk)
}
