/*
 * See `computeCid.test.ts` - this repo ships global manual mocks for
 * `multiformats/cid`/`multiformats/hashes/hasher` so unrelated tests don't
 * pull in real crypto. `publishArticle()` calls the real `computeCid()`, so
 * these tests need the real implementations too.
 */
jest.unmock('multiformats/cid')
jest.unmock('multiformats/hashes/hasher')

import {type Client} from '@atproto/lex'

import {publishArticle} from '#/lib/api/articles'
import {computeCid} from '#/lib/api/computeCid'
import {com} from '#/lexicons'

const DID = 'did:plc:testauthor123'

/**
 * These tests don't hit a live PDS (social-app has no `dev-env`-style
 * integration harness the way `atproto/packages/pds` does) - instead they
 * verify the one property that actually matters and can't be eyeballed: the
 * `associatedRefs` docCid `publishArticle()` puts on the companion post is
 * exactly `computeCid()` of the *same* document object that gets written,
 * and the document/publication URL join canonicalizes to the post's
 * `embed.external.uri`. That's the exact correctness property finding 15
 * and the bskyPostRef/associatedRefs circular-dependency resolution both
 * depend on - a live-PDS smoke test wouldn't catch a subtle mismatch here
 * any more directly than re-deriving the CID by hand does below.
 */
function makeMockClient(opts: {hasExistingPublication: boolean}) {
  const writes: unknown[] = []
  const call = jest.fn((endpoint: unknown, params: unknown) => {
    if (endpoint === com.atproto.repo.listRecords) {
      return Promise.resolve({
        records: opts.hasExistingPublication
          ? [
              {
                uri: `at://${DID}/site.standard.publication/existingpub`,
                cid: 'bafyreiexistingpubcid000000000000000000000000000000',
                value: {url: 'https://sunnahsky.com', name: 'Sunnahsky'},
              },
            ]
          : [],
      })
    }
    if (endpoint === com.atproto.repo.applyWrites) {
      writes.push((params as {writes: unknown[]}).writes)
      return Promise.resolve({results: []})
    }
    return Promise.reject(
      new Error(`unexpected call: ${JSON.stringify(endpoint)}`),
    )
  })
  const client = {assertDid: DID, call} as unknown as Client
  return {client, writes, call}
}

describe('publishArticle', () => {
  it('associatedRefs pins the exact CID of the document actually written, publication already exists', async () => {
    const {client, writes} = makeMockClient({hasExistingPublication: true})

    const result = await publishArticle({
      pdsClient: client,
      draft: {
        title: 'A test article',
        description: 'A description',
        markdown: 'Hello world',
        flavor: 'gfm',
      },
    })

    expect(writes).toHaveLength(1)
    const [batch] = writes as [
      {collection: string; value: Record<string, unknown>}[],
    ]
    // No publication write, since one already existed.
    expect(batch.map(w => w.collection)).toEqual([
      'app.bsky.feed.post',
      'site.standard.document',
    ])

    const postWrite = batch.find(w => w.collection === 'app.bsky.feed.post')!
    const docWrite = batch.find(w => w.collection === 'site.standard.document')!

    // The exact property under test: associatedRefs' document cid must
    // equal computeCid() of the exact document object that got written -
    // not an earlier/provisional version of it.
    const realDocCid = await computeCid(docWrite.value)
    const embed = (
      postWrite.value as {
        embed: {external: {associatedRefs: {uri: string; cid: string}[]}}
      }
    ).embed
    const docRef = embed.external.associatedRefs.find(r =>
      r.uri.includes('site.standard.document'),
    )
    expect(docRef?.cid).toBe(realDocCid)
    expect(docRef?.uri).toBe(result.documentUri)

    // The publication ref must point at the pre-existing publication
    // untouched (same uri/cid it already had), not a freshly-computed one.
    const pubRef = embed.external.associatedRefs.find(r =>
      r.uri.includes('site.standard.publication'),
    )
    expect(pubRef?.uri).toBe(
      `at://${DID}/site.standard.publication/existingpub`,
    )
    expect(pubRef?.cid).toBe(
      'bafyreiexistingpubcid000000000000000000000000000000',
    )

    // Finding 15: publication.url + document.path must canonicalize to
    // exactly the post's embed.external.uri.
    const externalUri = (postWrite.value as {embed: {external: {uri: string}}})
      .embed.external.uri
    const docPath = docWrite.value.path as string
    expect(externalUri).toBe(`https://sunnahsky.com${docPath}`)
  })

  it('creates the publication in the same atomic batch when none exists yet', async () => {
    const {client, writes} = makeMockClient({hasExistingPublication: false})

    await publishArticle({
      pdsClient: client,
      draft: {
        title: 'First article ever',
        description: 'A description',
        markdown: 'Hello world',
        flavor: 'gfm',
      },
    })

    expect(writes).toHaveLength(1)
    const [batch] = writes as [{collection: string}[]]
    expect(batch.map(w => w.collection)).toEqual([
      'site.standard.publication',
      'app.bsky.feed.post',
      'site.standard.document',
    ])
  })
})
