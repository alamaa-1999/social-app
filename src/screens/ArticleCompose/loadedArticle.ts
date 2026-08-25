import {AtUri, type AtUriString, type DatetimeString} from '@atproto/syntax'

import {SUNNAHSKY_SERVICE} from '#/lib/constants'
import {asArray, type LoadedArticleDocument} from '#/state/queries/articles'
import {type com, type site} from '#/lexicons'
import {draftFacetsToEditorFacets} from './drafts/state/api'
import {type MetadataValue} from './Metadata'
import {type EditorState} from './state'

export type EditingArticleState = {
  uri: AtUriString
  rkey: string
  cid: string
  publishedAt: DatetimeString
  updatedAt?: DatetimeString
  postUri: AtUriString
  postRkey: string
}

/**
 * Narrows the open `content` union down to the one shape this app ever
 * writes (`at.markpub.markdown`) - same defensive-narrowing posture as
 * `draftFacetsToEditorFacets`, since a document could in principle carry
 * some other content shape this screen was never built to edit.
 */
export function parseDocumentContent(
  content: site.standard.document.Main['content'],
):
  | {markdown: string; facets: unknown[]; flavor: 'gfm' | 'commonmark'}
  | undefined {
  const c = content as unknown as
    | {
        $type?: string
        flavor?: string
        text?: {markdown?: string; facets?: unknown[]}
      }
    | undefined
  if (
    c?.$type !== 'at.markpub.markdown' ||
    typeof c.text?.markdown !== 'string'
  ) {
    return undefined
  }
  return {
    markdown: c.text.markdown,
    facets: c.text.facets ?? [],
    flavor: c.flavor === 'commonmark' ? 'commonmark' : 'gfm',
  }
}

/**
 * Converts a loaded `site.standard.document` into everything `ArticleCompose`
 * needs to seed its editing state - the "editing a published article"
 * analogue of `onSelectDraft`'s per-field logic in `index.tsx`. Reuses
 * `draftFacetsToEditorFacets` directly for facets: a draft's `#draft.facets`
 * and a document's `content.text.facets` are structurally identical wire
 * shapes (both built by `facetsToWireFormat()`, whose own doc comment
 * confirms it *is* the `at.markpub.text.facets` shape) - only the TS
 * nominal type differs, hence the cast below.
 */
export function articleDocumentToComposeState(
  loaded: LoadedArticleDocument,
  opts: {did: string},
): {
  title: string
  subtitle: string
  editor: EditorState
  metadata: MetadataValue
  coverImage: site.standard.document.Main['coverImage']
  coverImagePreviewUri: string | undefined
  flavor: 'gfm' | 'commonmark'
  editingArticle: EditingArticleState
  bodyImages: com.sunnahsky.article.draft.defs.BodyImage[]
} {
  const {document} = loaded
  const parsedContent = parseDocumentContent(document.content)
  const legacy = document as typeof document & {
    author?: unknown
    translator?: unknown
    category?: unknown
    authors?: string[]
    translators?: string[]
    categories?: string[]
  }

  const coverImage = document.coverImage
  let coverImagePreviewUri: string | undefined
  if (coverImage) {
    const cid = 'ref' in coverImage ? coverImage.ref.toString() : coverImage.cid
    coverImagePreviewUri = `${SUNNAHSKY_SERVICE}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(opts.did)}&cid=${encodeURIComponent(cid)}`
  }

  // Guaranteed present - `useArticleDocumentQuery` already throws if this
  // article has no companion post to edit against.
  const postUri = document.bskyPostRef!.uri
  const docParsed = new AtUri(loaded.uri)
  const postParsed = new AtUri(postUri)

  return {
    title: document.title,
    subtitle: document.description ?? '',
    editor: {
      markdown: parsedContent?.markdown ?? '',
      facets: draftFacetsToEditorFacets(
        parsedContent?.facets as unknown as com.sunnahsky.article.draft.defs.Draft['facets'],
      ),
    },
    metadata: {
      authors: [...asArray(legacy.authors), ...asArray(legacy.author)],
      translators: [
        ...asArray(legacy.translators),
        ...asArray(legacy.translator),
      ],
      categories: [...asArray(legacy.categories), ...asArray(legacy.category)],
      tags: document.tags ?? [],
    },
    coverImage,
    coverImagePreviewUri,
    /*
     * Deliberately empty when editing an already-published article, rather
     * than populated from the assets record.
     *
     * This list only ever holds refs uploaded during *this* session.
     * Everything already published is carried forward by `publishArticle`,
     * which reads the existing assets record at write time - see the fetch in
     * its `Promise.all`. Reading it here as well would duplicate that
     * responsibility, and would go stale the moment the article were edited
     * from somewhere else.
     */
    bodyImages: [],
    flavor: parsedContent?.flavor ?? 'gfm',
    editingArticle: {
      uri: loaded.uri,
      rkey: docParsed.rkey,
      cid: loaded.cid,
      publishedAt: document.publishedAt,
      updatedAt: document.updatedAt,
      postUri,
      postRkey: postParsed.rkey,
    },
  }
}
