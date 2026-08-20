import {type Client} from '@atproto/lex'
import {type AtIdentifierString, type AtUriString} from '@atproto/syntax'
import {useQuery} from '@tanstack/react-query'

import {STALE} from '#/state/queries'
import {useAppviewClient} from '#/state/session'
import {getSunnahskyPublicPdsClient} from '#/state/session/clients'
import {app, com, site} from '#/lexicons'
import {selectGenuineCompanionPosts} from './articles-companion'
import {createQueryKey} from './util'

export {selectGenuineCompanionPosts} from './articles-companion'

const RQKEY_ROOT = 'author-articles'
export const RQKEY = (did: string) => createQueryKey(RQKEY_ROOT, {did})

const LIST_RECORDS_LIMIT = 100
const GET_POSTS_BATCH_SIZE = 25 // app.bsky.feed.getPosts' own `uris` maxLength

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
