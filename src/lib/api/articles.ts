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
export const articlePath = (did: string, docRkey: string) =>
  `/article/${did}/${docRkey}`
export const articleUrl = (did: string, docRkey: string) =>
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

/** Identifies the existing published article being edited, so `publishArticle` can update its document in place instead of creating a fresh one. */
export interface ArticleEditRef {
  documentUri: AtUriString
  documentRkey: string
  documentCid: string
  publishedAt: DatetimeString
}

interface PublishArticleOpts {
  draft: ArticleDraft
  pdsClient: Client
  editing?: ArticleEditRef
}

/**
 * Whether `record` is a genuine companion/announcement post for `document` -
 * i.e. its `associatedRefs` actually point back at this exact document.
 * No longer called anywhere in this file: Release 2 stopped verifying the
 * edit path against a companion post, since publishing no longer creates
 * one and there's no `bskyPostRef` left to identify which post to check.
 * Kept as the future primitive for identifying "has this article been
 * shared" once that query surface gets built - see the Discoverability
 * section of `encapsulated-squishing-thacker.md` for why that's a real,
 * deliberately unbuilt follow-on rather than dead code to delete outright.
 */
export function isGenuineCompanionPostRecord(
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
 * if it doesn't exist yet, then writes the `site.standard.document` (and its
 * `com.sunnahsky.article.assets` record, if the body has images) as one
 * atomic `applyWrites` call. Does not create or touch any
 * `app.bsky.feed.post` - announcing an article is a separate, repeatable
 * action an author can take any number of times (see `article-share.ts`'s
 * `resolveArticleShareLink` and the composer's `presetExternalLink`), not
 * something publishing does on their behalf.
 *
 * With `opts.editing` set, this same function updates an already-published
 * document in place instead: `applyWrites#update` at the existing document
 * rkey (not a fresh one), `publishedAt` preserved, `updatedAt` newly set.
 * Any companion post - from before this split, or from a later reshare - is
 * left completely alone either way; editing an article never touches a
 * post, and there is no `bskyPostRef` linking the two anymore.
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

  const [existingPubs, profileRecord, repoDesc, existingAssetsRecord] =
    await Promise.all([
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

  const docRkey: string = opts.editing?.documentRkey ?? TID.nextStr()
  const docUri: AtUriString =
    opts.editing?.documentUri ?? `at://${did}/site.standard.document/${docRkey}`

  const path = articlePath(did, docRkey)
  const now = toDatetimeString(new Date())

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
  }
  if (draft.authors?.length) documentRecord.authors = draft.authors
  if (draft.translators?.length) documentRecord.translators = draft.translators
  if (draft.categories?.length) documentRecord.categories = draft.categories

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
      collection: 'site.standard.document',
      rkey: docRkey,
      value: documentRecord,
    })
    if (bodyImages.length > 0) {
      /*
       * `#update` only if an assets record already exists at this rkey -
       * `#create` otherwise. An article published before this feature
       * existed (or one that never had a body image until this edit) has
       * no assets record yet, and `applyWrites#update` against a record
       * that was never created throws an uncaught `InternalServerError`
       * rather than a clean 4xx - confirmed directly by reproducing this
       * exact sequence against a real PDS. Unconditionally using `#update`
       * here worked by coincidence for every article that already had one
       * (the common case while testing this feature in one sitting), which
       * is why this shipped without being caught: the *first* time any
       * given article ever gets a body image is exactly the case this
       * missed.
       */
      writes.push({
        $type: existingAssetsRecord
          ? 'com.atproto.repo.applyWrites#update'
          : 'com.atproto.repo.applyWrites#create',
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

  return {documentUri: docUri, publicationUri: pubUri}
}

interface DeleteArticleOpts {
  documentRkey: string
}

/**
 * Deletes an already-published article: the `site.standard.document` record
 * always, and its `com.sunnahsky.article.assets` record too, if one exists.
 * An article with no body images never had an assets record at all - fetch
 * and check first, the same defensive pattern `publishArticle`'s own
 * `existingAssetsRecord` fetch already uses, rather than assuming one exists
 * and hitting the same uncaught `applyWrites#delete`-on-a-missing-record
 * failure that pattern exists to avoid.
 *
 * Deletes either record via the PDS's own generic, URI-keyed
 * `deleteDereferencedBlobs` - nothing here names the cover image or body
 * images explicitly, since deletion is what dereferences their blobs.
 *
 * Deliberately does not touch the article's announcement post, if it has
 * one - an old post with an outdated link is normal, expected
 * chronological-feed behavior, not something this needs to clean up.
 */
export async function deleteArticle(
  pdsClient: Client,
  opts: DeleteArticleOpts,
) {
  const did = pdsClient.assertDid

  const existingAssetsRecord = await pdsClient
    .call(com.atproto.repo.getRecord, {
      repo: did,
      collection: 'com.sunnahsky.article.assets',
      rkey: opts.documentRkey,
    })
    .catch(() => undefined)

  const writes: com.atproto.repo.applyWrites.$InputBody['writes'] = [
    {
      $type: 'com.atproto.repo.applyWrites#delete',
      collection: 'site.standard.document',
      rkey: opts.documentRkey,
    },
  ]
  if (existingAssetsRecord) {
    writes.push({
      $type: 'com.atproto.repo.applyWrites#delete',
      collection: 'com.sunnahsky.article.assets',
      rkey: opts.documentRkey,
    })
  }

  await pdsClient.call(com.atproto.repo.applyWrites, {
    repo: did,
    writes,
    validate: true,
  })
}
