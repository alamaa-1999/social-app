import {TID} from '@atproto/common-web'
import {type Client} from '@atproto/lex'
import {type AtUriString} from '@atproto/syntax'

import {deriveTextContentFromMarkdown} from '#/lib/strings/markdown-strip'
import {com, type site} from '#/lexicons'
import {computeCid} from './computeCid'

/**
 * Fixed convention this whole write path depends on: `publication.url` never
 * varies per-article, and `document.path` is always this exact subpath
 * shape. Both sides of finding 15's canonicalization
 * (`atproto/packages/bsky/src/util/standard-site.ts`) must join to exactly
 * the companion post's `embed.external.uri` - `sunnahsky.com` is not in that
 * file's `SUBPATH_FRIENDLY_DOMAINS`, so the match has to be exact, not a
 * prefix. Verified empirically (traced by hand against the real
 * `joinPath`/`canonicalizeHttpUrl` logic) before landing this.
 */
const PUBLICATION_URL = 'https://sunnahsky.com'
const PUBLICATION_NAME = 'Sunnahsky'
const articlePath = (did: string, docRkey: string) =>
  `/article/${did}/${docRkey}`
const articleUrl = (did: string, docRkey: string) =>
  `${PUBLICATION_URL}${articlePath(did, docRkey)}`

export interface ArticleDraft {
  title: string
  description: string
  markdown: string
  flavor: 'gfm' | 'commonmark'
  facets?: unknown[]
  tags?: string[]
  category?: string
  author?: string
  translator?: string
  contributors?: site.standard.document.Contributor[]
  coverImage?: site.standard.document.Main['coverImage']
}

interface PublishArticleOpts {
  draft: ArticleDraft
  pdsClient: Client
}

/**
 * Publishes an article: creates the account's `site.standard.publication`
 * if it doesn't exist yet, then writes the companion `app.bsky.feed.post`
 * and the `site.standard.document`, all as one atomic `applyWrites` call.
 *
 * Pre-computed-ref pattern generalized from `post()`'s reply-chain handling
 * (`src/lib/api/index.ts`), but with a real complication `post()` never
 * has: a reply-chain's refs are strictly one-directional (post[i] only ever
 * references post[i-1]), while a document and its companion post reference
 * *each other* (`document.bskyPostRef` -> post, `post.associatedRefs` ->
 * document). Two CIDs that are each a function of the other has no
 * solution in general - so this only works because the two directions
 * don't actually need the same level of exactness:
 *
 * - `post.embed.external.associatedRefs` MUST be exact. It's fed straight
 *   into the AppView's version-pinned lookup (confirmed by reading
 *   `atproto/packages/bsky/src/hydration/hydrator.ts`'s
 *   `externalAssociatedRefs()` and `.../hydration/external.ts`'s
 *   `getSiteStandardRecordsByRef`/`siteStandardRecordKey`, keyed by the
 *   literal `${uri}@${cid}` the post supplied) - a CID that doesn't match
 *   the document's real on-chain bytes simply won't resolve, silently
 *   falling back to a plain link card (the exact failure mode finding 15
 *   already flagged, just from an unaccounted-for cause).
 * - `document.bskyPostRef` does NOT need to be exact. Confirmed by
 *   grepping the entire `atproto`/`bsky` server codebase: `bskyPostRef`
 *   appears only in generated lexicon type files, never read or validated
 *   by any actual route or hydration logic. It's a passive, informational
 *   back-reference only.
 *
 * So the cycle is broken by computing `bskyPostRef` from a *provisional*
 * post (before `associatedRefs` is added) - close enough to be useful,
 * never verified by anyone, and never submitted as-is. The document is
 * then finalized (bskyPostRef included, never mutated again) and its real
 * CID is computed. Only then is the real post built, with `associatedRefs`
 * pointing at that exact, final document CID.
 */
export async function publishArticle(opts: PublishArticleOpts) {
  const {draft, pdsClient} = opts
  const did = pdsClient.assertDid

  const existingPubs = await pdsClient.call(com.atproto.repo.listRecords, {
    repo: did,
    collection: 'site.standard.publication',
    limit: 1,
  })
  const hasPublication = existingPubs.records.length > 0

  const publicationRecord: site.standard.publication.Main = {
    $type: 'site.standard.publication',
    url: PUBLICATION_URL,
    name: PUBLICATION_NAME,
  }
  const pubRkey = TID.nextStr()
  const pubUri = hasPublication
    ? existingPubs.records[0].uri
    : (`at://${did}/site.standard.publication/${pubRkey}` as AtUriString)
  const pubCid = hasPublication
    ? existingPubs.records[0].cid
    : await computeCid(publicationRecord)

  let tid = TID.next()
  const docRkey = tid.toString()
  tid = TID.next(tid)
  const postRkey = tid.toString()
  const docUri = `at://${did}/site.standard.document/${docRkey}` as AtUriString
  const postUri = `at://${did}/app.bsky.feed.post/${postRkey}` as AtUriString

  const path = articlePath(did, docRkey)
  const uri = articleUrl(did, docRkey)
  const now = new Date().toISOString()

  // Provisional post - no `associatedRefs` yet, never submitted, only used
  // to seed `bskyPostRef` (see doc comment above for why this is fine).
  const provisionalPost = {
    $type: 'app.bsky.feed.post',
    text: draft.title,
    createdAt: now,
    embed: {
      $type: 'app.bsky.embed.external',
      external: {
        $type: 'app.bsky.embed.external#external',
        uri,
        title: draft.title,
        description: draft.description,
        thumb: draft.coverImage,
      },
    },
  }
  const provisionalPostCid = await computeCid(provisionalPost)

  const documentRecord: site.standard.document.Main & {
    author?: string
    translator?: string
    category?: string
  } = {
    $type: 'site.standard.document',
    site: pubUri,
    title: draft.title,
    description: draft.description,
    publishedAt: now,
    path,
    tags: draft.tags,
    contributors: draft.contributors,
    coverImage: draft.coverImage,
    textContent: deriveTextContentFromMarkdown(draft.markdown),
    content: {
      $type: 'at.markpub.markdown',
      flavor: draft.flavor,
      text: {
        $type: 'at.markpub.text',
        markdown: draft.markdown,
        facets: draft.facets,
      },
    },
    bskyPostRef: {uri: postUri, cid: provisionalPostCid},
  }
  if (draft.author) documentRecord.author = draft.author
  if (draft.translator) documentRecord.translator = draft.translator
  if (draft.category) documentRecord.category = draft.category

  // Document is now final (never mutated after this point) - its real CID
  // is what `associatedRefs` below must pin exactly.
  const docCid = await computeCid(documentRecord)

  const postRecord = {
    ...provisionalPost,
    embed: {
      ...provisionalPost.embed,
      external: {
        ...provisionalPost.embed.external,
        associatedRefs: [
          {uri: docUri, cid: docCid},
          {uri: pubUri, cid: pubCid},
        ],
      },
    },
  }

  const writes: com.atproto.repo.applyWrites.$InputBody['writes'] = []
  if (!hasPublication) {
    writes.push({
      $type: 'com.atproto.repo.applyWrites#create',
      collection: 'site.standard.publication',
      rkey: pubRkey,
      value: publicationRecord,
    })
  }
  writes.push({
    $type: 'com.atproto.repo.applyWrites#create',
    collection: 'app.bsky.feed.post',
    rkey: postRkey,
    value: postRecord,
  })
  writes.push({
    $type: 'com.atproto.repo.applyWrites#create',
    collection: 'site.standard.document',
    rkey: docRkey,
    value: documentRecord,
  })

  await pdsClient.call(com.atproto.repo.applyWrites, {
    repo: did,
    writes,
    validate: true,
  })

  return {documentUri: docUri, postUri, publicationUri: pubUri}
}
