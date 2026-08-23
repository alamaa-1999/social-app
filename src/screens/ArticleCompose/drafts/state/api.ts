import {deriveTextContentFromMarkdown} from '#/lib/strings/markdown-strip'
import {type com, type site} from '#/lexicons'
import {type MetadataValue} from '../../Metadata'
import {
  type EditorFacet,
  type FacetFeature,
  facetsToWireFormat,
} from '../../state'
import {type ArticleDraftSummary} from './schema'

const EXCERPT_LENGTH = 140

export type ArticleComposeState = {
  title: string
  subtitle: string
  markdown: string
  facets: EditorFacet[]
  metadata: MetadataValue
  coverImage: site.standard.document.Main['coverImage']
}

/** Builds the `#draft` payload directly from `ArticleCompose`'s local state - no `localRefPaths` bookkeeping needed, unlike the post composer's `composerStateToDraft` (see the doc comment on `ArticleDraftSummary`). */
export function articleStateToDraft(
  state: ArticleComposeState,
): com.sunnahsky.article.draft.defs.Draft {
  return {
    title: state.title || undefined,
    description: state.subtitle || undefined,
    markdown: state.markdown || undefined,
    flavor: 'gfm',
    // `l.Unknown$TypedObject` is an opaque branded type on the TypeScript
    // side (same footgun as `site.standard.document.Main['content']` in
    // `articles.ts`) - the PDS/AppView accept a plain $type-tagged literal
    // unmodified, but it needs an explicit cast here to satisfy the type.
    facets: facetsToWireFormat(
      state.facets,
    ) as unknown as com.sunnahsky.article.draft.defs.Draft['facets'],
    tags: state.metadata.tags.length ? state.metadata.tags : undefined,
    categories: state.metadata.categories.length
      ? state.metadata.categories
      : undefined,
    authors: state.metadata.authors.length ? state.metadata.authors : undefined,
    translators: state.metadata.translators.length
      ? state.metadata.translators
      : undefined,
    coverImage: state.coverImage,
  }
}

const KNOWN_FACET_FEATURE_TYPES = new Set<FacetFeature['$type']>([
  'com.sunnahsky.richtext.facets.formatting#underline',
  'com.sunnahsky.richtext.facets.formatting#color',
  'com.sunnahsky.richtext.facets.blocks#textAlign',
  'com.sunnahsky.richtext.facets.blocks#typography',
])

/**
 * Inverse of `facetsToWireFormat` - parses a loaded draft's wire-format
 * facets (an open union, `l.Unknown$TypedObject[]` on the TS side, same as
 * `site.standard.document.Main['content']`) back into `EditorFacet[]` for
 * `onSelectDraft` to hand to the body editor. Defensive: skips any entry
 * that doesn't match the exact shape this screen itself ever writes,
 * rather than trusting network data blindly.
 */
export function draftFacetsToEditorFacets(
  facets: com.sunnahsky.article.draft.defs.Draft['facets'],
): EditorFacet[] {
  if (!facets) return []
  const result: EditorFacet[] = []
  for (const raw of facets) {
    const f = raw as unknown as {
      index?: {byteStart?: unknown; byteEnd?: unknown}
      features?: unknown[]
    }
    const byteStart = f.index?.byteStart
    const byteEnd = f.index?.byteEnd
    const feature = f.features?.[0] as FacetFeature | undefined
    if (
      typeof byteStart !== 'number' ||
      typeof byteEnd !== 'number' ||
      !feature ||
      typeof feature !== 'object' ||
      !('$type' in feature) ||
      !KNOWN_FACET_FEATURE_TYPES.has(feature.$type)
    ) {
      continue
    }
    result.push({byteStart, byteEnd, feature})
  }
  return result
}

export function draftViewToArticleSummary(
  view: com.sunnahsky.article.draft.defs.DraftView,
): ArticleDraftSummary {
  const markdown = view.draft.markdown ?? ''
  const text = deriveTextContentFromMarkdown(markdown).trim()
  const excerpt =
    text.length > EXCERPT_LENGTH
      ? `${text.slice(0, EXCERPT_LENGTH).trimEnd()}...`
      : text
  return {
    id: view.id,
    createdAt: view.createdAt,
    updatedAt: view.updatedAt,
    draft: view.draft,
    title: view.draft.title || 'Untitled',
    excerpt,
    wordCount: markdown.trim() ? markdown.trim().split(/\s+/).length : 0,
  }
}
