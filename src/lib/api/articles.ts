import {TID} from '@atproto/common-web'
import {type Client} from '@atproto/lex'
import {
  type AtUriString,
  type DatetimeString,
  toDatetimeString,
} from '@atproto/syntax'

import {deriveTextContentFromMarkdown} from '#/lib/strings/markdown-strip'
import {logger} from '#/logger'
import {
  type EditorFacet,
  facetsToWireFormat,
  validateFacetBounds,
} from '#/screens/ArticleCompose/state'
import {app, com, type site} from '#/lexicons'
import * as bsky from '#/types/bsky'
import {resolveBodyImages} from './article-assets'
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
const articlePath = (did: string, docRkey: string) =>
  `/article/${did}/${docRkey}`
const articleUrl = (did: string, docRkey: string) =>
  `${PUBLICATION_URL}${articlePath(did, docRkey)}`

export interface ArticleDraft {
  title: string
  description: string
  markdown: string
  flavor: 'gfm' | 'commonmark'
  facets?: EditorFacet[]
  tags?: string[]
  /**
   * Multi-select, per the ArticleCompose Figma design (confirmed against
   * the design owner - Author/Translator/Category all use the same
   * search+checklist+add-new picker, not a single free-text value each).
   * Still Phase 1b/1's extension fields, not real lexicon schema members -
   * widening to arrays is a TypeScript-only change, no lexicon edit needed.
   */
  categories?: string[]
  authors?: string[]
  translators?: string[]
  contributors?: site.standard.document.Contributor[]
  coverImage?: site.standard.document.Main['coverImage']
  /**
   * Blob refs for images embedded in `markdown`, carried on the draft because
   * a `BlobRef` cannot be rebuilt from the CID in a `getBlob` URL alone -
   * `mimeType` and `size` are unreadable for a blob that was never tethered.
   * Without them a draft reopened in a new session would publish with its
   * images silently missing. See `article-assets.ts`.
   */
  bodyImages?: com.sunnahsky.article.draft.defs.BodyImage[]
}

/** Identifies the existing published article/companion post being edited, so `publishArticle` can update in place instead of creating fresh records. */
export interface ArticleEditRef {
  documentUri: AtUriString
  documentRkey: string
  documentCid: string
  publishedAt: DatetimeString
  postUri: AtUriString
  postRkey: string
}

interface PublishArticleOpts {
  draft: ArticleDraft
  pdsClient: Client
  editing?: ArticleEditRef
}

/** Same shape/purpose as `articles-companion.ts`'s `isGenuineCompanionPost`, but checked against a record already in hand (no extra fetch) - narrows the concurrent-edit race window (same account, two tabs/sessions) between loading an article for editing and publishing the update; doesn't close it, since this check and the write below aren't atomic with each other. */
function isGenuineCompanionPostRecord(
  record: app.bsky.feed.post.Main,
  document: {uri: string; cid: string},
): boolean {
  if (!bsky.isType(app.bsky.embed.external.main, record.embed)) return false
  return !!record.embed.external.associatedRefs?.some(
    ref => ref.uri === document.uri && ref.cid === document.cid,
  )
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
 *
 * With `opts.editing` set, this same function updates an already-published
 * article in place instead: `applyWrites#update` at the existing document
 * and post rkeys (not fresh ones), `publishedAt` preserved, `updatedAt`
 * newly set, and the companion post's `associatedRefs`/link-preview fields
 * re-pinned to the edited document's new CID - all in the same atomic
 * batch, with the same CID-exactness discipline as the create path. The
 * post's own `text` is never touched either way; only its embed metadata
 * changes.
 */
export async function publishArticle(opts: PublishArticleOpts) {
  const {draft, pdsClient} = opts
  const did = pdsClient.assertDid

  // Fail closed, before any network round-trip: the PDS never validates
  // these byte ranges (`site.standard.document`'s facets are an open
  // extension field), so this is the only check they ever get. Facets
  // reaching here were just computed by this same app's editor state
  // immediately before publish, so an invalid range means a real client
  // bug, not foreign/adversarial data - refusing to publish beats silently
  // dropping formatting the user believes they still have.
  const {valid: validFacets, invalidCount} = validateFacetBounds(
    draft.markdown,
    draft.facets ?? [],
  )
  if (invalidCount > 0) {
    throw new Error(
      `Article has ${invalidCount} facet(s) with out-of-range byte offsets - refusing to publish`,
    )
  }

  const [
    existingPubs,
    profileRecord,
    repoDesc,
    existingPostRecord,
    existingAssetsRecord,
  ] = await Promise.all([
    pdsClient.call(com.atproto.repo.listRecords, {
      repo: did,
      collection: 'site.standard.publication',
      limit: 1,
    }),
    // Best-effort: a missing/unreadable profile just falls back to the
    // handle below, not worth failing the whole publish over.
    pdsClient
      .call(com.atproto.repo.getRecord, {
        repo: did,
        collection: 'app.bsky.actor.profile',
        rkey: 'self',
      })
      .catch(() => undefined),
    pdsClient.call(com.atproto.repo.describeRepo, {repo: did}),
    opts.editing
      ? pdsClient.call(com.atproto.repo.getRecord, {
          repo: did,
          collection: 'app.bsky.feed.post',
          rkey: opts.editing.postRkey,
        })
      : Promise.resolve(undefined),
    /*
     * The existing assets record, on the edit path only.
     *
     * This is load-bearing rather than an optimisation. For an image the
     * author did not re-upload during this editing session, the app holds
     * only the CID parsed out of the markdown URL - not the `BlobRef` the
     * record needs. Those refs exist nowhere else, so omitting this fetch
     * would silently drop every previously-published image from the record,
     * and `deleteDereferencedBlobs` would then delete the bytes from the
     * blobstore permanently.
     *
     * Absent is a normal outcome, not an error: an article published before
     * this feature existed, or one that simply has no body images, has no
     * assets record at all.
     */
    opts.editing
      ? pdsClient
          .call(com.atproto.repo.getRecord, {
            repo: did,
            collection: 'com.sunnahsky.article.assets',
            rkey: opts.editing.documentRkey,
          })
          .catch(() => undefined)
      : Promise.resolve(undefined),
  ])
  const hasPublication = existingPubs.records.length > 0
  const existingPub = hasPublication ? existingPubs.records[0] : undefined

  if (opts.editing && existingPostRecord) {
    const existingPostValue =
      existingPostRecord.value as app.bsky.feed.post.Main
    if (
      !isGenuineCompanionPostRecord(existingPostValue, {
        uri: opts.editing.documentUri,
        cid: opts.editing.documentCid,
      })
    ) {
      throw new Error("This article's companion post could not be verified")
    }
  }

  // Sunnahsky is infrastructure, not an editorial voice - each Striker's
  // publication is named after them, not the platform, so every account's
  // articles read as independently authored rather than one shared voice.
  // `url` stays fixed to the shared domain regardless. Kept in sync on
  // every publish (not just set once) so a later display-name change is
  // reflected rather than going permanently stale.
  const profileDisplayName = (
    profileRecord?.value as {displayName?: string} | undefined
  )?.displayName?.trim()
  const publicationName = profileDisplayName || repoDesc.handle

  const existingPubValue = existingPub?.value as
    site.standard.publication.Main | undefined
  const publicationNeedsRename =
    hasPublication && existingPubValue?.name !== publicationName

  const publicationRecord: site.standard.publication.Main = hasPublication
    ? {
        ...(existingPubValue as site.standard.publication.Main),
        name: publicationName,
      }
    : {
        $type: 'site.standard.publication',
        url: PUBLICATION_URL,
        name: publicationName,
      }
  const pubRkey = TID.nextStr()
  const pubUri = hasPublication
    ? existingPub!.uri
    : (`at://${did}/site.standard.publication/${pubRkey}` as AtUriString)
  // Must be recomputed when renaming: the publication's on-chain CID
  // changes the instant the update write lands, and this value feeds the
  // companion post's `associatedRefs` below - same exactness requirement
  // as `documentRecord`'s own CID, per this function's doc comment.
  const pubCid =
    hasPublication && !publicationNeedsRename
      ? existingPub!.cid
      : await computeCid(publicationRecord)

  let docRkey: string
  let postRkey: string
  if (opts.editing) {
    docRkey = opts.editing.documentRkey
    postRkey = opts.editing.postRkey
  } else {
    let tid = TID.next()
    docRkey = tid.toString()
    tid = TID.next(tid)
    postRkey = tid.toString()
  }
  const docUri: AtUriString =
    opts.editing?.documentUri ?? `at://${did}/site.standard.document/${docRkey}`
  const postUri: AtUriString =
    opts.editing?.postUri ?? `at://${did}/app.bsky.feed.post/${postRkey}`

  const path = articlePath(did, docRkey)
  const uri = articleUrl(did, docRkey)
  const now = toDatetimeString(new Date())

  // Provisional post - no `associatedRefs` yet, never submitted, only used
  // to seed `bskyPostRef` (see doc comment above for why this is fine).
  // When editing, this starts from the *existing* post record instead of a
  // blank one, so its own text/createdAt/reply/etc. carry through untouched
  // below - only the embed's link-preview fields get overridden.
  const provisionalPost = opts.editing
    ? {
        ...(existingPostRecord!.value as app.bsky.feed.post.Main),
        embed: {
          $type: 'app.bsky.embed.external' as const,
          external: {
            $type: 'app.bsky.embed.external#external' as const,
            uri,
            title: draft.title,
            description: draft.description,
            thumb: draft.coverImage,
          },
        },
      }
    : {
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
    authors?: string[]
    translators?: string[]
    categories?: string[]
  } = {
    $type: 'site.standard.document',
    site: pubUri,
    title: draft.title,
    description: draft.description,
    // Preserved across edits, never touched again after the original
    // publish - `updatedAt` is what tracks edit history instead, and is
    // deliberately left unset on a fresh publish (no prior edit to show).
    publishedAt: opts.editing?.publishedAt ?? now,
    updatedAt: opts.editing ? now : undefined,
    path,
    tags: draft.tags,
    contributors: draft.contributors,
    coverImage: draft.coverImage,
    textContent: deriveTextContentFromMarkdown(draft.markdown),
    // `content` is a deliberately open union (`site.standard.document.json`,
    // Phase 2a) - `l.Unknown$TypedObject` is an opaque branded type on the
    // TypeScript side, so a plain $type-tagged literal needs an explicit
    // cast here even though the PDS accepts it unmodified (proven in
    // atproto/packages/pds/tests/articles.test.ts).
    content: {
      $type: 'at.markpub.markdown',
      flavor: draft.flavor,
      text: {
        $type: 'at.markpub.text',
        markdown: draft.markdown,
        facets: facetsToWireFormat(validFacets),
      },
    } as unknown as site.standard.document.Main['content'],
    bskyPostRef: {uri: postUri, cid: provisionalPostCid},
  }
  if (draft.authors?.length) documentRecord.authors = draft.authors
  if (draft.translators?.length) documentRecord.translators = draft.translators
  if (draft.categories?.length) documentRecord.categories = draft.categories

  // Document is now final (never mutated after this point) - its real CID
  // is what `associatedRefs` below must pin exactly.
  const docCid = await computeCid(documentRecord)

  /*
   * Body-image blobs.
   *
   * Order matters: refs already in the published assets record come first, and
   * this session's draft refs overlay them, so a re-uploaded image wins while
   * everything the author has not touched is carried forward untouched. Losing
   * an entry here is not a cosmetic bug - `deleteDereferencedBlobs` deletes the
   * dropped blob from the blobstore permanently.
   *
   * The list itself is derived from the *final* markdown rather than from
   * session state, so images the author removed are pruned and stop being
   * tethered.
   */
  const existingAssetImages =
    (
      existingAssetsRecord?.value as
        com.sunnahsky.article.assets.Main | undefined
    )?.images ?? []
  const knownBodyImages = [
    ...existingAssetImages.map(entry => ({image: entry.image})),
    ...(draft.bodyImages ?? []),
  ]
  const {images: bodyImages, missing: missingBodyImages} = resolveBodyImages(
    draft.markdown,
    knownBodyImages,
  )
  if (missingBodyImages.length > 0) {
    /*
     * The body references a blob we hold no ref for, so it cannot be tethered
     * and will not load once published. In practice this means a draft created
     * before `bodyImages` existed. Not fatal - the rest of the article is
     * fine - but it must not pass silently, because the symptom (an image that
     * renders while drafting and 404s after publishing) is otherwise very hard
     * to trace back to its cause.
     */
    logger.warn('publishArticle: body image with no known blob ref', {
      count: missingBodyImages.length,
    })
  }

  const assetsRecord: com.sunnahsky.article.assets.Main = {
    $type: 'com.sunnahsky.article.assets',
    document: docUri,
    images: bodyImages,
  }

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
  } else if (publicationNeedsRename) {
    writes.push({
      $type: 'com.atproto.repo.applyWrites#update',
      collection: 'site.standard.publication',
      rkey: existingPub!.uri.split('/').pop()!,
      value: publicationRecord,
    })
  }
  if (opts.editing) {
    writes.push({
      $type: 'com.atproto.repo.applyWrites#update',
      collection: 'app.bsky.feed.post',
      rkey: postRkey,
      value: postRecord,
    })
    writes.push({
      $type: 'com.atproto.repo.applyWrites#update',
      collection: 'site.standard.document',
      rkey: docRkey,
      value: documentRecord,
    })
    if (bodyImages.length > 0) {
      writes.push({
        $type: 'com.atproto.repo.applyWrites#update',
        collection: 'com.sunnahsky.article.assets',
        rkey: docRkey,
        value: assetsRecord,
      })
    } else if (existingAssetsRecord) {
      // Every image was removed from the body. Delete the record rather than
      // leaving an empty one behind; this is also what dereferences the blobs.
      writes.push({
        $type: 'com.atproto.repo.applyWrites#delete',
        collection: 'com.sunnahsky.article.assets',
        rkey: docRkey,
      })
    }
  } else {
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
    if (bodyImages.length > 0) {
      writes.push({
        $type: 'com.atproto.repo.applyWrites#create',
        collection: 'com.sunnahsky.article.assets',
        rkey: docRkey,
        value: assetsRecord,
      })
    }
  }

  await pdsClient.call(com.atproto.repo.applyWrites, {
    repo: did,
    writes,
    validate: true,
  })

  return {documentUri: docUri, postUri, publicationUri: pubUri}
}
