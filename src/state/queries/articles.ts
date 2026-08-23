import {type Client} from '@atproto/lex'
import {type AtIdentifierString, AtUri, type AtUriString} from '@atproto/syntax'
import {useQuery} from '@tanstack/react-query'

import {STALE} from '#/state/queries'
import {useAppviewClient, usePdsClient, useSession} from '#/state/session'
import {getSunnahskyPublicPdsClient} from '#/state/session/clients'
import {app, com, site} from '#/lexicons'
import {selectGenuineCompanionPosts} from './articles-companion'
import {createQueryKey} from './util'

export {selectGenuineCompanionPosts} from './articles-companion'

const RQKEY_ROOT = 'author-articles'
export const RQKEY = (did: string) => createQueryKey(RQKEY_ROOT, {did})

const METADATA_HISTORY_RQKEY_ROOT = 'own-article-metadata-history'
export const METADATA_HISTORY_RQKEY = (did: string) =>
  createQueryKey(METADATA_HISTORY_RQKEY_ROOT, {did})

const DOCUMENT_RQKEY_ROOT = 'article-document'
export const DOCUMENT_RQKEY = (uri: string) =>
  createQueryKey(DOCUMENT_RQKEY_ROOT, {uri})

const LIST_RECORDS_LIMIT = 100
const GET_POSTS_BATCH_SIZE = 25 // app.bsky.feed.getPosts' own `uris` maxLength

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

/**
 * An author's published articles, resolved to their real companion posts -
 * `site.standard.document` has no AppView indexer (by design), so discovery
 * goes straight to the PDS via `listRecords`; each result's `bskyPostRef` is
 * then batch-resolved through the AppView's `getPosts` to get the candidate
 * post to render (the one whose `embed.external.associatedRefs` triggers
 * the free `StandardSiteEmbed` card everywhere posts already render - see
 * `articles client ui plan.md`'s Phase 3). A single bounded fetch, not
 * paginated, per that same plan's scoping.
 *
 * Every candidate is verified via `isGenuineCompanionPost()` before being
 * rendered - `bskyPostRef` alone is not trustworthy (see that function's
 * doc comment). Documents whose companion post can't be resolved (deleted,
 * moderation-hidden), whose resolved post belongs to a different author, or
 * whose resolved post fails the `associatedRefs` cross-check are all
 * silently dropped rather than shown broken or spoofed.
 *
 * Returns raw posts, not moderation decisions - moderation depends on live
 * user preferences and is computed downstream by the consuming section,
 * matching `PostQuotes.tsx`'s pattern rather than baking it into the cache.
 */
export function useAuthorArticlesQuery(did: string | undefined) {
  const appviewClient = useAppviewClient()
  return useQuery({
    queryKey: RQKEY(did || ''),
    enabled: !!did,
    staleTime: STALE.MINUTES.FIVE,
    queryFn: async () => {
      const pdsClient = getSunnahskyPublicPdsClient()
      const {records} = await pdsClient.call(com.atproto.repo.listRecords, {
        repo: did! as AtIdentifierString,
        collection: 'site.standard.document',
        limit: LIST_RECORDS_LIMIT,
        reverse: true,
      })

      const docs = records.flatMap(record => {
        const parsed = site.standard.document.$safeParse(record.value)
        if (!parsed.success || !parsed.value.bskyPostRef?.uri) return []
        return [{uri: record.uri, cid: record.cid, doc: parsed.value}]
      })
      if (!docs.length) return []

      const postUris = docs.map(entry => entry.doc.bskyPostRef!.uri)
      const posts: app.bsky.feed.defs.PostView[] = []
      for (let i = 0; i < postUris.length; i += GET_POSTS_BATCH_SIZE) {
        const batch = postUris.slice(i, i + GET_POSTS_BATCH_SIZE)
        const res = await appviewClient.call(app.bsky.feed.getPosts, {
          uris: batch,
        })
        posts.push(...res.posts)
      }

      return selectGenuineCompanionPosts(did!, docs, posts)
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
      if (!result.value.bskyPostRef?.uri) {
        throw new Error('This article has no companion post to edit against')
      }
      if (!cid) {
        throw new Error('This article record has no cid')
      }
      return {uri: recordUri, cid, document: result.value}
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

const INDEXING_POLL_DELAYS_MS = [500, 1000, 1500, 1500, 1500] // ~6s total

/**
 * Best-effort poll for the AppView to finish indexing a just-published
 * article's companion post. Closes the real (seconds-long) window between
 * `publishArticle()`'s atomic PDS write and the AppView catching up, during
 * which `useAuthorArticlesQuery` would otherwise silently omit the new
 * article - indistinguishable from a failed publish if the author is routed
 * straight back to their profile. Not a correctness requirement: if every
 * attempt is exhausted, the tab's own `staleTime`-based refetch eventually
 * picks it up regardless, so callers should invoke this in the background
 * and invalidate `RQKEY(did)` on success rather than block on it.
 */
export async function waitForArticleIndexed(
  appviewClient: Client,
  postUri: AtUriString,
): Promise<boolean> {
  for (const delayMs of INDEXING_POLL_DELAYS_MS) {
    await new Promise(resolve => setTimeout(resolve, delayMs))
    const res = await appviewClient.call(app.bsky.feed.getPosts, {
      uris: [postUri],
    })
    if (res.posts.length > 0) return true
  }
  return false
}
