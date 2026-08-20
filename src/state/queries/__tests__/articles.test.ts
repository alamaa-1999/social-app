import {type AtUriString, type DidString} from '@atproto/syntax'

import {type app} from '#/lexicons'
import {selectGenuineCompanionPosts} from '../articles-companion'

const OWNER_DID = 'did:plc:owner' as DidString
const OTHER_DID = 'did:plc:someoneelse' as DidString

const DOC = {
  uri: 'at://did:plc:owner/site.standard.document/doc1' as AtUriString,
  cid: 'bafyreidoc1cid00000000000000000000000000000000000000',
}

function makeDoc(bskyPostRefUri: AtUriString) {
  return {
    ...DOC,
    doc: {
      $type: 'site.standard.document' as const,
      title: 'Test article',
      publishedAt: '2026-01-01T00:00:00.000Z',
      site: 'at://did:plc:owner/site.standard.publication/pub1',
      bskyPostRef: {uri: bskyPostRefUri, cid: 'unused-bskyPostRef-cid'},
    },
  }
}

function makePost(opts: {
  uri: AtUriString
  authorDid: DidString
  associatedRefs?: {uri: AtUriString; cid: string}[]
}): app.bsky.feed.defs.PostView {
  return {
    uri: opts.uri,
    cid: 'bafyreipostcid0000000000000000000000000000000000000',
    author: {
      did: opts.authorDid,
      handle: 'test.bsky.social',
    },
    indexedAt: '2026-01-01T00:00:00.000Z',
    record: {
      $type: 'app.bsky.feed.post',
      text: 'Test article',
      createdAt: '2026-01-01T00:00:00.000Z',
      ...(opts.associatedRefs
        ? {
            embed: {
              $type: 'app.bsky.embed.external',
              external: {
                $type: 'app.bsky.embed.external#external',
                uri: 'https://sunnahsky.com/article/did:plc:owner/doc1',
                title: 'Test article',
                description: 'A description',
                associatedRefs: opts.associatedRefs,
              },
            },
          }
        : {}),
    },
  }
}

describe('selectGenuineCompanionPosts', () => {
  it('includes a post that is genuinely the document’s companion (same author, matching associatedRefs)', () => {
    const postUri: AtUriString = 'at://did:plc:owner/app.bsky.feed.post/post1'
    const docs = [makeDoc(postUri)]
    const posts = [
      makePost({
        uri: postUri,
        authorDid: OWNER_DID,
        associatedRefs: [{uri: DOC.uri, cid: DOC.cid}],
      }),
    ]

    const result = selectGenuineCompanionPosts(OWNER_DID, docs, posts)

    expect(result).toHaveLength(1)
    expect(result[0].uri).toBe(postUri)
  })

  it('excludes a bskyPostRef pointing at a different account’s post, even with matching associatedRefs', () => {
    const postUri: AtUriString =
      'at://did:plc:someoneelse/app.bsky.feed.post/post1'
    const docs = [makeDoc(postUri)]
    const posts = [
      makePost({
        uri: postUri,
        authorDid: OTHER_DID,
        // Even if this attacker-controlled post happened to carry a
        // matching associatedRefs entry, it isn't the account that
        // published this document, so it must still be excluded.
        associatedRefs: [{uri: DOC.uri, cid: DOC.cid}],
      }),
    ]

    const result = selectGenuineCompanionPosts(OWNER_DID, docs, posts)

    expect(result).toHaveLength(0)
  })

  it('excludes a bskyPostRef pointing at the same account’s own post with no matching associatedRefs entry back to that document', () => {
    const postUri: AtUriString =
      'at://did:plc:owner/app.bsky.feed.post/some-other-post'
    const docs = [makeDoc(postUri)]
    const posts = [
      makePost({
        uri: postUri,
        authorDid: OWNER_DID,
        // Same account, but this post's associatedRefs point at an
        // unrelated document/publication - it was never published
        // together with DOC, regardless of what bskyPostRef claims.
        associatedRefs: [
          {
            uri: 'at://did:plc:owner/site.standard.document/some-other-doc',
            cid: 'bafyreisomeotherdoccid000000000000000000000000000000',
          },
        ],
      }),
    ]

    const result = selectGenuineCompanionPosts(OWNER_DID, docs, posts)

    expect(result).toHaveLength(0)
  })

  it('excludes a same-account post with no external embed at all', () => {
    const postUri: AtUriString =
      'at://did:plc:owner/app.bsky.feed.post/plain-post'
    const docs = [makeDoc(postUri)]
    const posts = [makePost({uri: postUri, authorDid: OWNER_DID})]

    const result = selectGenuineCompanionPosts(OWNER_DID, docs, posts)

    expect(result).toHaveLength(0)
  })
})
