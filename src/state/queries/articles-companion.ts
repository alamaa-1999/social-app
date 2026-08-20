import {type AtUriString} from '@atproto/syntax'

import {app} from '#/lexicons'
import * as bsky from '#/types/bsky'

/**
 * True only if `post` is genuinely the companion post `document` (identified
 * by its own `uri`/`cid`, as returned by `listRecords`) was published
 * together with - not merely authored by the same account.
 *
 * `document.bskyPostRef` is entirely repo-owner-controlled and never
 * validated server-side (confirmed by grep across `atproto`/`bsky`: it's
 * read nowhere but generated lexicon type files - see the doc comment on
 * `publishArticle()` in `src/lib/api/articles.ts`). A same-account check
 * alone doesn't stop a Striker from pointing one of their documents at a
 * completely unrelated post of their own. The field that IS exact and
 * server-validated is the post's `embed.external.associatedRefs`
 * (`com.atproto.repo.strongRef[]`) - the AppView resolves it via a
 * version-pinned `${uri}@${cid}` lookup (`externalAssociatedRefs()` /
 * `getSiteStandardRecordsByRef` in `atproto/packages/bsky`), so a post whose
 * `associatedRefs` contains this exact document's `uri` and `cid` could only
 * have been built with knowledge of that document's real on-chain bytes at
 * write time - in practice, only the genuine `publishArticle()` write path
 * that produced them together can satisfy this.
 *
 * Known limitation, not a bug: if document editing is ever added, an edited
 * document's `cid` changes, so it stops matching its original companion
 * post's (CID-pinned) `associatedRefs` until a new companion post is
 * published - consistent with the same version-exact lookup the AppView's
 * hydrator already relies on for this field.
 */
export function isGenuineCompanionPost(
  post: app.bsky.feed.defs.PostView,
  document: {uri: string; cid: string},
): boolean {
  const record = post.record as app.bsky.feed.post.Main
  if (!bsky.isType(app.bsky.embed.external.main, record.embed)) return false
  const associatedRefs = record.embed.external.associatedRefs
  return !!associatedRefs?.some(
    ref => ref.uri === document.uri && ref.cid === document.cid,
  )
}

export type ArticleDocument = {
  uri: string
  cid: string
  doc: {bskyPostRef?: {uri: AtUriString}}
}

/**
 * Resolves each document to its verified companion post - the shared
 * selection logic between `useAuthorArticlesQuery`'s real fetch
 * (`articles.ts`) and its regression tests (`__tests__/articles.test.ts`),
 * so the security-relevant checks (same-author, then
 * `isGenuineCompanionPost`) are exercised exactly as written, not
 * reimplemented in the test.
 *
 * Deliberately kept in its own module, free of `#/state/session`'s heavy
 * transitive imports (Reanimated/Worklets via `List.tsx`) - pulling those
 * into a test that only needs this pure selection logic breaks the test
 * environment for unrelated reasons.
 */
export function selectGenuineCompanionPosts(
  did: string,
  docs: ArticleDocument[],
  posts: app.bsky.feed.defs.PostView[],
): app.bsky.feed.defs.PostView[] {
  const byUri = new Map(posts.map(post => [post.uri, post]))
  return docs.flatMap(entry => {
    const postUri = entry.doc.bskyPostRef?.uri
    if (!postUri) return []
    const post = byUri.get(postUri)
    if (!post) return []
    // Cheap early filter - subsumed by, but not a substitute for, the
    // associatedRefs cross-check below (see isGenuineCompanionPost).
    if (post.author.did !== did) return []
    if (!isGenuineCompanionPost(post, entry)) return []
    return [post]
  })
}
