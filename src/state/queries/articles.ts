import {type AtIdentifierString, AtUri, type AtUriString} from '@atproto/syntax'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'

import {deleteArticle} from '#/lib/api/articles'
import {LOCAL_DEV_SERVICE, SUNNAHSKY_SERVICE} from '#/lib/constants'
import {STALE} from '#/state/queries'
import {usePdsClient, useSession} from '#/state/session'
import {
  getPublicAppviewClient,
  getSunnahskyPublicPdsClient,
} from '#/state/session/clients'
import {app, com, site} from '#/lexicons'
import {createQueryKey} from './util'

const RQKEY_ROOT = 'author-articles'
export const RQKEY = (did: string) => createQueryKey(RQKEY_ROOT, {did})

const METADATA_HISTORY_RQKEY_ROOT = 'own-article-metadata-history'
export const METADATA_HISTORY_RQKEY = (did: string) =>
  createQueryKey(METADATA_HISTORY_RQKEY_ROOT, {did})

const DOCUMENT_RQKEY_ROOT = 'article-document'
export const DOCUMENT_RQKEY = (uri: string) =>
  createQueryKey(DOCUMENT_RQKEY_ROOT, {uri})

const LIST_RECORDS_LIMIT = 100

/**
 * Normalizes a `site.standard.document` extension field that may be a bare
 * string (old shape, pre-multi-select), an array of strings (current
 * shape), or absent. These fields (`author`/`translator`/`category` and
 * their `authors`/`translators`/`categories` successors) are TypeScript-only
 * extension properties, not real lexicon schema members - the PDS accepts
 * and preserves them unvalidated, so a document published before this
 * widening can genuinely still carry the old bare-string field name/shape.
 */
export function asArray(v: unknown): string[] {
  if (v == null) return []
  if (Array.isArray(v))
    return v.filter((x): x is string => typeof x === 'string')
  return typeof v === 'string' ? [v] : []
}

export type AuthorArticle = {
  uri: AtUriString
  cid: string
  doc: site.standard.document.Main
}

/**
 * An author's published articles, read straight off their own PDS via
 * `listRecords` - no AppView involved at all.
 *
 * This used to resolve each document's `bskyPostRef` through the AppView's
 * `getPosts` and render the real companion post via `PostFeedItem`, matching
 * how the same card looks everywhere else on the site. That depended on the
 * AppView re-indexing the post on every edit, which it never does in
 * practice - `app.bsky.feed.post` records are not something any stock
 * Bluesky client ever updates in place, so nothing exercises that path
 * upstream, and the public `api.bsky.app` AppView (a third-party service
 * this project doesn't operate) appears to simply never re-derive a post's
 * hydrated view after its first index. Confirmed directly: three separate,
 * successful PDS-side edits to the same post over several hours, and
 * `getPosts` kept serving the exact original `indexedAt`/cid/associatedRefs
 * from the very first publish. A document that had been edited even once
 * would then permanently fail the old `isGenuineCompanionPost` cross-check
 * and vanish from this tab for good - not a transient staleness window.
 *
 * Reading the document directly sidesteps that entirely: the PDS has no
 * indexing delay, so a just-published or just-edited article shows up the
 * moment its own write lands, and there is no companion-post spoofing
 * surface to defend against here in the first place, since every document
 * comes straight from the account's own repo via the same-origin PDS.
 * `ProfileArticlesSection` builds a `StandardSiteEmbed` card directly from
 * these fields (title/description/coverImage) rather than a real `PostView` -
 * the trade-off is that this tab no longer shows the companion post's own
 * live like/repost/reply counts, which is the only distinguishable behavior
 * change: a document with a `bskyPostRef` still links to the exact same
 * article; a document with none is still shown at all, unlike before, since
 * there is no longer a post to require in the first place.
 */
export function useAuthorArticlesQuery(did: string | undefined) {
  return useQuery({
    queryKey: RQKEY(did || ''),
    enabled: !!did,
    staleTime: STALE.MINUTES.FIVE,
    queryFn: async (): Promise<AuthorArticle[]> => {
      const pdsClient = getSunnahskyPublicPdsClient()
      const {records} = await pdsClient.call(com.atproto.repo.listRecords, {
        repo: did! as AtIdentifierString,
        collection: 'site.standard.document',
        limit: LIST_RECORDS_LIMIT,
        reverse: true,
      })

      return records.flatMap(record => {
        const parsed = site.standard.document.$safeParse(record.value)
        if (!parsed.success) return []
        return [{uri: record.uri, cid: record.cid, doc: parsed.value}]
      })
    },
  })
}

export type LoadedArticleDocument = {
  uri: AtUriString
  cid: string
  document: site.standard.document.Main
}

/**
 * Fetches a single `site.standard.document` by its full AT-URI, for the
 * "edit an already-published article" flow. Uses the signed-in author's own
 * authenticated `pdsClient`, not the public client `useAuthorArticlesQuery`
 * uses for viewing *other* accounts' articles - editing is always
 * same-account, and the caller (`ArticleComposeScreen`) always derives `uri`
 * from `currentAccount.did`, never from anything route-suppliable, so this
 * hook can never be pointed at another account's document.
 */
export function useArticleDocumentQuery(uri: AtUriString | undefined) {
  const pdsClient = usePdsClient()
  return useQuery({
    queryKey: DOCUMENT_RQKEY(uri || ''),
    enabled: !!uri,
    staleTime: STALE.SECONDS.THIRTY,
    queryFn: async (): Promise<LoadedArticleDocument> => {
      const parsed = new AtUri(uri!)
      const {
        uri: recordUri,
        cid,
        value,
      } = await pdsClient.call(com.atproto.repo.getRecord, {
        repo: parsed.host,
        collection: 'site.standard.document',
        rkey: parsed.rkey,
      })
      const result = site.standard.document.$safeParse(value)
      if (!result.success) {
        throw new Error('Could not parse this article')
      }
      if (!cid) {
        throw new Error('This article record has no cid')
      }
      return {uri: recordUri, cid, document: result.value}
    },
  })
}

/**
 * Deletes the signed-in Striker's own already-published article. Always
 * same-account, same as {@link useArticleDocumentQuery} above - `did` and
 * `rkey` are only used here to invalidate this account's own cached article
 * lists/documents afterward, the same three keys `doConfirmPublish` already
 * touches after a publish/edit.
 */
export function useDeleteArticleMutation() {
  const pdsClient = usePdsClient()
  const {currentAccount} = useSession()
  const queryClient = useQueryClient()
  const did = currentAccount?.did

  return useMutation({
    mutationFn: async ({
      documentUri,
      documentRkey,
    }: {
      documentUri: AtUriString
      documentRkey: string
    }) => {
      await deleteArticle(pdsClient, {documentRkey})
      return {documentUri, documentRkey}
    },
    onSuccess: ({documentUri, documentRkey}) => {
      void queryClient.invalidateQueries({queryKey: RQKEY(did || '')})
      void queryClient.invalidateQueries({
        queryKey: DOCUMENT_RQKEY(documentUri),
      })
      void queryClient.invalidateQueries({
        queryKey: PUBLIC_ARTICLE_RQKEY(did || '', documentRkey),
      })
    },
  })
}

const PUBLIC_ARTICLE_RQKEY_ROOT = 'public-article'
export const PUBLIC_ARTICLE_RQKEY = (did: string, rkey: string) =>
  createQueryKey(PUBLIC_ARTICLE_RQKEY_ROOT, {did, rkey})

/**
 * Matches `getSunnahskyPublicPdsClient()`'s own service selection exactly -
 * the reader has no session to build a `blobUrl()`-style URL from
 * `currentAccount.service` the way the composer's edit path does
 * (`loadedArticle.ts`), so this mirrors that client's own choice directly.
 */
const PUBLIC_PDS_SERVICE = __DEV__ ? LOCAL_DEV_SERVICE : SUNNAHSKY_SERVICE

function publicBlobUrl(did: string, blob: {toString: () => string} | string) {
  const cid = typeof blob === 'string' ? blob : blob.toString()
  return `${PUBLIC_PDS_SERVICE}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(cid)}`
}

export type PublicArticle = {
  documentUri: AtUriString
  documentCid: string
  document: site.standard.document.Main
  /** The document owner's own Bluesky handle, e.g. "alice.sunnahsky.com". */
  handle: string
  publicationName: string
  publicationAvatarUri?: string
  coverImageSrc?: string
  /**
   * TypeScript-only extension fields (see `asArray`'s own doc comment) -
   * not on `document` itself, since `site.standard.document.Main`'s type
   * only reflects real lexicon schema members.
   */
  authors: string[]
  translators: string[]
}

/**
 * Fetches a single, published `site.standard.document` by its owning `did`
 * and `rkey`, for the **public** reader - unlike {@link useArticleDocumentQuery},
 * which is explicitly same-account-only and authenticated, this is the
 * correct tool for viewing *other* accounts' articles, since it goes through
 * {@link getSunnahskyPublicPdsClient} the same way {@link useAuthorArticlesQuery}
 * already does.
 *
 * `document.site` is a bare string, not guaranteed to be an `at://` URI -
 * other Standard.site-compatible clients may write a loose `https://`
 * reference with no publication record behind it at all (architecture
 * decision 4: any ATproto client can write to a Sunnahsky-hosted repo). That
 * case falls back to the `did` itself as a display name rather than treating
 * a missing publication as an error - the article document itself is still
 * genuinely fetchable and renderable.
 */
export function usePublicArticleQuery(
  did: string | undefined,
  rkey: string | undefined,
) {
  return useQuery({
    queryKey: PUBLIC_ARTICLE_RQKEY(did || '', rkey || ''),
    enabled: !!did && !!rkey,
    staleTime: STALE.MINUTES.FIVE,
    queryFn: async (): Promise<PublicArticle> => {
      const pdsClient = getSunnahskyPublicPdsClient()
      const {
        uri: documentUri,
        cid: documentCid,
        value,
      } = await pdsClient.call(com.atproto.repo.getRecord, {
        repo: did! as AtIdentifierString,
        collection: 'site.standard.document',
        rkey: rkey!,
      })
      const parsed = site.standard.document.$safeParse(value)
      if (!parsed.success) {
        throw new Error('Could not parse this article')
      }
      if (!documentCid) {
        throw new Error('This article record has no cid')
      }
      const document = parsed.value

      // `authors`/`translators` (and their legacy singular `author`/
      // `translator` forms) are the same TypeScript-only extension fields
      // `useOwnArticleMetadataHistoryQuery` above already reads off a
      // `$safeParse`d value the identical way - not real lexicon schema
      // members, but preserved unstripped on the actual parsed object at
      // runtime regardless of what its static type declares.
      const documentExtras = parsed.value as typeof parsed.value & {
        author?: unknown
        authors?: unknown
        translator?: unknown
        translators?: unknown
      }
      const authors = [
        ...asArray(documentExtras.author),
        ...asArray(documentExtras.authors),
      ]
      const translators = [
        ...asArray(documentExtras.translator),
        ...asArray(documentExtras.translators),
      ]

      // The account's own handle for the header's "@handle" line - a
      // separate lookup from the document/publication records above, since
      // neither carries it. Public appview reads work unauthenticated, so
      // this needs no session either.
      let handle = did!
      try {
        const appviewClient = getPublicAppviewClient()
        const profile = await appviewClient.call(app.bsky.actor.getProfile, {
          actor: did! as AtIdentifierString,
        })
        handle = profile.handle
      } catch {
        // Falls back to showing the bare did - the article itself is still
        // genuinely fetchable and renderable without it.
      }

      let publicationName = did!
      let publicationAvatarUri: string | undefined
      if (document.site.startsWith('at://')) {
        try {
          const siteUri = new AtUri(document.site)
          const pub = await pdsClient.call(com.atproto.repo.getRecord, {
            repo: siteUri.host,
            collection: 'site.standard.publication',
            rkey: siteUri.rkey,
          })
          const pubParsed = site.standard.publication.$safeParse(pub.value)
          if (pubParsed.success) {
            publicationName = pubParsed.value.name
            if (pubParsed.value.icon) {
              publicationAvatarUri = publicBlobUrl(
                siteUri.host,
                'ref' in pubParsed.value.icon
                  ? pubParsed.value.icon.ref
                  : pubParsed.value.icon.cid,
              )
            }
          }
        } catch {
          // A publication fetch failure shouldn't block rendering the
          // article itself - falls back to the `did` as a display name.
        }
      }

      const coverImageSrc = document.coverImage
        ? publicBlobUrl(
            did!,
            'ref' in document.coverImage
              ? document.coverImage.ref
              : document.coverImage.cid,
          )
        : undefined

      return {
        documentUri,
        documentCid,
        document,
        handle,
        publicationName,
        publicationAvatarUri,
        coverImageSrc,
        authors,
        translators,
      }
    },
  })
}

const METADATA_HISTORY_MAX_PAGES = 50 // runaway-loop guard only, not a product-facing truncation

/**
 * The signed-in Striker's own history of author/translator/category values,
 * derived from their own published `site.standard.document` records - there
 * is no separate storage for this, and a freshly-typed value only becomes
 * suggestible after the article using it is actually published (not within
 * the same draft). Always reads the *current* session's own DID - unlike
 * `useAuthorArticlesQuery(did)` (which intentionally takes a caller-supplied
 * `did`, for viewing *other* profiles' articles), this hook has no reason to
 * ever take one, so it doesn't expose a parameter that could be misused
 * later to query an arbitrary account.
 *
 * "Private, per-account, never shared" describes the UX (each composer only
 * suggests from its own past usage) - it is NOT a confidentiality property.
 * `site.standard.document` records, and therefore these values, are already
 * fully public via the same `listRecords` call anyone can make.
 *
 * Walks the full `listRecords` cursor chain (not a single bounded page) so
 * an account's older author/category values aren't silently dropped just
 * because it has published many articles since. `METADATA_HISTORY_MAX_PAGES`
 * is a safety net against a malformed/cyclic cursor, not a normal-case cap -
 * acceptable given this only runs when a metadata popover is actually opened
 * and the result is cached for `STALE.MINUTES.FIVE`.
 */
export function useOwnArticleMetadataHistoryQuery() {
  const {currentAccount} = useSession()
  const did = currentAccount?.did
  return useQuery({
    queryKey: METADATA_HISTORY_RQKEY(did || ''),
    enabled: !!did,
    staleTime: STALE.MINUTES.FIVE,
    queryFn: async () => {
      const pdsClient = getSunnahskyPublicPdsClient()
      const authors = new Set<string>()
      const translators = new Set<string>()
      const categories = new Set<string>()

      let cursor: string | undefined
      let pages = 0
      do {
        const {records, cursor: next} = await pdsClient.call(
          com.atproto.repo.listRecords,
          {
            repo: did!,
            collection: 'site.standard.document',
            limit: LIST_RECORDS_LIMIT, // page size, not a cap on total
            cursor,
          },
        )
        for (const record of records) {
          const parsed = site.standard.document.$safeParse(record.value)
          if (!parsed.success) continue
          const value = parsed.value as typeof parsed.value & {
            author?: unknown
            authors?: unknown
            translator?: unknown
            translators?: unknown
            category?: unknown
            categories?: unknown
          }
          for (const a of [...asArray(value.author), ...asArray(value.authors)])
            authors.add(a)
          for (const t of [
            ...asArray(value.translator),
            ...asArray(value.translators),
          ])
            translators.add(t)
          for (const c of [
            ...asArray(value.category),
            ...asArray(value.categories),
          ])
            categories.add(c)
        }
        cursor = next
        pages++
      } while (cursor && pages < METADATA_HISTORY_MAX_PAGES)

      return {
        authors: [...authors],
        translators: [...translators],
        categories: [...categories],
      }
    },
  })
}
