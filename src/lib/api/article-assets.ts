import {LOCAL_DEV_SERVICE, SUNNAHSKY_SERVICE} from '#/lib/constants'
import {type com} from '#/lexicons'

/**
 * Origins `cidFromSrc` below trusts as genuinely Sunnahsky's own PDS - the
 * same set {@link getSunnahskyPublicPdsClient} (`state/session/clients.ts`)
 * actually points at, production or `__DEV__`'s local PDS, so the check
 * never rejects a URL the reader's own fetch would have accepted.
 */
const TRUSTED_ORIGINS = new Set(
  [SUNNAHSKY_SERVICE, __DEV__ ? LOCAL_DEV_SERVICE : null].filter(
    (origin): origin is string => origin !== null,
  ),
)

/**
 * Builds the `com.sunnahsky.article.assets` record - the companion record whose
 * only job is to hold blob refs so an article's body images are tethered to the
 * repo.
 *
 * Why it has to exist at all: atproto promotes a blob out of temporary storage
 * only when a record field of type `blob` references it, and an article body
 * carries its images as markdown URLs rather than record fields. Cover images
 * work because they genuinely are blob fields. Body images had no such field
 * anywhere, so their blobs stayed untethered and `getBlob` 404'd on them
 * permanently.
 *
 * ## The invariant this module exists to hold
 *
 * A CID parsed out of markdown is **only ever a subtractive filter** over blob
 * refs this account already holds - from the draft's `bodyImages`, or carried
 * forward from an existing assets record. A parsed CID is never used to
 * *construct* a blob reference.
 *
 * That matters because markdown is arbitrary text. Pasting someone else's
 * `getBlob` URL into an article would otherwise read as "this repo owns that
 * blob". The PDS's own commit-time ownership check would reject the write, so
 * this is not the only line of defence - but it should hold by design here
 * rather than by the accident of nobody having tried it. `resolveBodyImages`
 * enforces it structurally: it can only ever return refs that were passed into
 * it.
 */

/**
 * The caps `com.sunnahsky.article.assets` declares, mirrored for use before
 * upload.
 *
 * They live here, beside the record they describe, rather than in the screen
 * that enforces them - and `__tests__/article-assets.test.ts` asserts they
 * still match the lexicon JSON. Enforcing a limit in the client that has
 * quietly drifted from the schema is worse than not enforcing it: the author
 * is stopped at a threshold the server would have accepted, or waved past one
 * it will reject at publish.
 */
export const MAX_BODY_IMAGE_BYTES = 3000000
export const MAX_BODY_IMAGES = 30

type BodyImage = com.sunnahsky.article.draft.defs.BodyImage
type AssetImage = com.sunnahsky.article.assets.Image

/**
 * Every blob CID referenced by a `com.atproto.sync.getBlob` URL in `markdown`.
 *
 * Deliberately matches the URL anywhere in the text rather than only inside
 * well-formed `![alt](url)` syntax, and deliberately ignores the host and the
 * `did` parameter. The asymmetry of the two failure modes is the reason:
 *
 * - Matching something that is not really an embedded image keeps a blob alive
 *   that nothing displays. That is a small storage leak.
 * - *Failing* to match a real embedded image drops it from the record, and
 *   `deleteDereferencedBlobs` then deletes those bytes from the blobstore
 *   permanently.
 *
 * One of those is recoverable and the other destroys the author's image, so
 * this errs firmly toward over-matching.
 */
export function cidsInMarkdown(markdown: string): Set<string> {
  const cids = new Set<string>()
  // `getBlob` is the only endpoint this app ever points an <img> at, and its
  // cid parameter is percent-encoded by `blobUrl`. Tolerate either ordering of
  // did/cid, and any host, since neither is load-bearing for identifying which
  // blob is meant.
  const pattern = /com\.atproto\.sync\.getBlob\?[^\s)"'<>]*/g
  for (const match of markdown.matchAll(pattern)) {
    const query = match[0].slice(match[0].indexOf('?') + 1)
    for (const part of query.split('&')) {
      const [key, value] = part.split('=')
      if (key !== 'cid' || !value) continue
      try {
        cids.add(decodeURIComponent(value))
      } catch {
        // A malformed percent-escape is not a CID we could have written.
        // Skipping it cannot destroy anything: an image we really own would
        // have been encoded by `blobUrl` and so would decode cleanly.
      }
    }
  }
  return cids
}

/**
 * Picks the blob refs to write into the assets record for a body of markdown.
 *
 * `known` is every ref this account holds for the article - the draft's
 * `bodyImages` plus, on the edit path, the refs already in the published assets
 * record. Later entries win on CID collision, which is what makes "carry the
 * existing record forward, then overlay this session's uploads" read correctly
 * at the call site.
 *
 * `missing` lists CIDs present in the markdown that no known ref covers. That
 * is not an error here - it is what a draft created before `bodyImages` existed
 * looks like - but the caller should surface it rather than silently publishing
 * an article whose images will not load.
 */
export function resolveBodyImages(
  markdown: string,
  known: readonly BodyImage[],
): {images: AssetImage[]; missing: string[]} {
  const wanted = cidsInMarkdown(markdown)

  const byCid = new Map<string, BodyImage>()
  for (const entry of known) {
    const cid = blobCid(entry.image)
    if (cid) byCid.set(cid, entry)
  }

  const images: AssetImage[] = []
  const missing: string[] = []
  for (const cid of wanted) {
    const entry = byCid.get(cid)
    if (!entry) {
      missing.push(cid)
      continue
    }
    images.push({image: entry.image})
  }

  return {images, missing}
}

/**
 * The `cid` query parameter of a `getBlob` URL, but only when `src` is
 * actually hosted at a trusted Sunnahsky origin ({@link TRUSTED_ORIGINS}) -
 * unlike {@link cidsInMarkdown} above, under-matching here is the safe
 * direction, not over-matching.
 *
 * Moved here from `editor-web/imageNodeView.ts`, where it originally had no
 * origin check at all - a plain `indexOf('com.atproto.sync.getBlob?')`
 * substring search. Safe there only because every `src` it was ever fed came
 * from this app's own same-origin `blobUrl()`, never from untrusted content.
 * Once the article reader started calling this to decide whether an
 * *untrusted* document's image gets fetched at all, that same shape-only
 * check would let `https://tracker.example/xrpc/com.atproto.sync.getBlob?
 * did=x&cid=y` straight through - it matches the marker string, extracts a
 * clean CID, and points at an attacker's own host. Fixed at this function
 * itself, not a second, stricter sibling callers could reach for the wrong
 * one of - every caller, old and new, gets the origin check by construction.
 * `imageNodeView.ts`'s own URLs are always same-origin already, so the added
 * check costs it nothing and changes no existing behavior there.
 */
export function cidFromSrc(src: string): string | undefined {
  let url: URL
  try {
    url = new URL(src)
  } catch {
    return undefined
  }
  if (!TRUSTED_ORIGINS.has(url.origin)) return undefined

  const marker = 'com.atproto.sync.getBlob?'
  const at = src.indexOf(marker)
  if (at === -1) return undefined
  for (const part of src.slice(at + marker.length).split('&')) {
    const [key, value] = part.split('=')
    if (key !== 'cid' || !value) continue
    try {
      return decodeURIComponent(value)
    } catch {
      return undefined
    }
  }
  return undefined
}

/**
 * The CID of a blob ref as a string.
 *
 * `BlobRef` is a union - the current typed shape carries `ref`, the legacy one
 * carries a plain `cid` string. A freshly uploaded blob is always the former,
 * but drafts persist refs across app versions, so narrow rather than assume.
 * Mirrors the same narrowing in `ArticleCompose`'s `blobUrl`.
 */
export function blobCid(blob: unknown): string | undefined {
  if (!blob || typeof blob !== 'object') return undefined
  const candidate = blob as {ref?: {toString: () => string}; cid?: unknown}
  if (candidate.ref) return candidate.ref.toString()
  if (typeof candidate.cid === 'string') return candidate.cid
  return undefined
}
