import {type UriString} from '@atproto/lex'
import {AtUri, type AtUriString} from '@atproto/syntax'

import {articleUrl} from '#/lib/api/articles'
import {imageToThumb, type ResolvedExternalLink} from '#/lib/api/resolve'
import {LOCAL_DEV_SERVICE, SUNNAHSKY_SERVICE} from '#/lib/constants'
import {getSunnahskyPublicPdsClient} from '#/state/session/clients'
import {com, site} from '#/lexicons'

/**
 * Matches `getSunnahskyPublicPdsClient()`'s own service selection - this
 * runs unauthenticated (sharing must work for *another* account's article,
 * not just your own), so there's no session-derived service URL the way the
 * composer's own edit path builds one in `loadedArticle.ts`.
 */
const PUBLIC_PDS_SERVICE = __DEV__ ? LOCAL_DEV_SERVICE : SUNNAHSKY_SERVICE

function publicBlobUrl(did: string, blob: {toString: () => string} | string) {
  const cid = typeof blob === 'string' ? blob : blob.toString()
  return `${PUBLIC_PDS_SERVICE}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(cid)}`
}

/**
 * Resolves an already-published article into the same `ResolvedExternalLink`
 * shape the composer builds for any other external link. Fed to
 * `precacheResolveLinkQuery` (mirroring the existing `quote` field's own
 * pattern), this is what lets "Share" open the ordinary post composer
 * pre-filled with a real `StandardSiteEmbed` card - for any account's
 * article, not just the signed-in one's own, since sharing is deliberately
 * never author-restricted.
 *
 * Always reads fresh from the public PDS client rather than trusting a
 * caller's own cached copy of the document - one uniform path for every
 * caller (the Articles-tab Share action, the post-publish share prompt, and
 * any future reshare), not a second, unverified variant.
 *
 * Both `associatedRefs` copies this function builds (top-level, and nested
 * under `view.external`) must carry the document's exact on-chain CID, not
 * an approximation - a mismatch simply fails to resolve into a rich card
 * both here and, more importantly, once the real post is written (see
 * `publishArticle`'s own doc comment on why CID-exactness matters).
 */
export async function resolveArticleShareLink(
  documentUri: AtUriString,
): Promise<ResolvedExternalLink> {
  const pdsClient = getSunnahskyPublicPdsClient()
  const parsedDocUri = new AtUri(documentUri)
  const did = parsedDocUri.host

  const {cid: docCid, value} = await pdsClient.call(
    com.atproto.repo.getRecord,
    {
      repo: did,
      collection: 'site.standard.document',
      rkey: parsedDocUri.rkey,
    },
  )
  const parsedDoc = site.standard.document.$safeParse(value)
  if (!parsedDoc.success) {
    throw new Error('Could not parse this article')
  }
  if (!docCid) {
    throw new Error('This article record has no cid')
  }
  const document = parsedDoc.value

  const associatedRefs: com.atproto.repo.strongRef.Main[] = [
    {uri: documentUri, cid: docCid},
  ]
  // A bare `https://` `site` (no publication record) is a valid, if rarer,
  // shape - any ATproto client can write to a Sunnahsky-hosted repo, so a
  // missing publication ref here isn't an error, just one fewer ref.
  if (document.site.startsWith('at://')) {
    const siteUri = new AtUri(document.site)
    const pub = await pdsClient.call(com.atproto.repo.getRecord, {
      repo: siteUri.host,
      collection: 'site.standard.publication',
      rkey: siteUri.rkey,
    })
    if (pub.cid) {
      associatedRefs.push({uri: document.site as AtUriString, cid: pub.cid})
    }
  }

  const thumbUrl = document.coverImage
    ? publicBlobUrl(
        did,
        'ref' in document.coverImage
          ? document.coverImage.ref
          : document.coverImage.cid,
      )
    : undefined

  const uri = articleUrl(did, parsedDocUri.rkey)
  const title = document.title
  const description = document.description ?? ''

  return {
    type: 'external',
    uri,
    title,
    description,
    thumb: thumbUrl ? await imageToThumb(thumbUrl) : undefined,
    associatedRefs,
    view: {
      $type: 'app.bsky.embed.external#view',
      external: {
        $type: 'app.bsky.embed.external#viewExternal',
        uri: uri as UriString,
        thumb: thumbUrl as UriString | undefined,
        title,
        description,
        associatedRefs,
      },
    },
  }
}
