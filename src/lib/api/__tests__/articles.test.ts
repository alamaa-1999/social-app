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
function makeMockClient(opts: {
  hasExistingPublication: boolean
  /** Name already on the existing publication record, if any. */
  existingPublicationName?: string
  /** Account's current profile displayName - drives the personalized
   * publication name (falls back to handle if blank/missing). */
  displayName?: string
  handle?: string
  /** Existing companion post record, returned for `getRecord` calls against
   * `app.bsky.feed.post` - only relevant for `opts.editing` test cases. */
  existingPost?: Record<string, unknown>
}) {
  const writes: unknown[] = []
  const call = jest.fn((endpoint: unknown, params: unknown) => {
    if (endpoint === com.atproto.repo.listRecords) {
      return Promise.resolve({
        records: opts.hasExistingPublication
          ? [
              {
                uri: `at://${DID}/site.standard.publication/existingpub`,
                cid: 'bafyreiexistingpubcid000000000000000000000000000000',
                value: {
                  url: 'https://sunnahsky.com',
                  name: opts.existingPublicationName ?? 'Existing Name',
                },
              },
            ]
          : [],
      })
    }
    if (endpoint === com.atproto.repo.getRecord) {
      const {collection} = params as {collection: string}
      if (collection === 'app.bsky.feed.post') {
        return Promise.resolve({value: opts.existingPost})
      }
      return Promise.resolve({value: {displayName: opts.displayName ?? ''}})
    }
    if (endpoint === com.atproto.repo.describeRepo) {
      return Promise.resolve({handle: opts.handle ?? 'author.test'})
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
    const {client, writes} = makeMockClient({
      hasExistingPublication: true,
      existingPublicationName: 'Existing Author',
      displayName: 'Existing Author',
    })

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

  it('creates the publication in the same atomic batch when none exists yet, named after the account', async () => {
    const {client, writes} = makeMockClient({
      hasExistingPublication: false,
      displayName: 'Zubair Ibrahim',
    })

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
    const [batch] = writes as [
      {collection: string; value: Record<string, unknown>}[],
    ]
    expect(batch.map(w => w.collection)).toEqual([
      'site.standard.publication',
      'app.bsky.feed.post',
      'site.standard.document',
    ])
    const pubWrite = batch.find(
      w => w.collection === 'site.standard.publication',
    )!
    // Sunnahsky is infrastructure, not an editorial voice - each account's
    // publication is named after them, not the platform, and `url` still
    // points at the shared domain regardless.
    expect(pubWrite.value.name).toBe('Zubair Ibrahim')
    expect(pubWrite.value.url).toBe('https://sunnahsky.com')
  })

  it('falls back to the account handle when displayName is blank', async () => {
    const {client, writes} = makeMockClient({
      hasExistingPublication: false,
      displayName: '',
      handle: 'zubair.sunnahsky.com',
    })

    await publishArticle({
      pdsClient: client,
      draft: {
        title: 'An article',
        description: 'A description',
        markdown: 'Hello world',
        flavor: 'gfm',
      },
    })

    const [batch] = writes as [{collection: string; value: {name: string}}[]]
    const pubWrite = batch.find(
      w => w.collection === 'site.standard.publication',
    )!
    expect(pubWrite.value.name).toBe('zubair.sunnahsky.com')
  })

  it('renames an existing publication in the same atomic batch when the display name has drifted', async () => {
    const {client, writes} = makeMockClient({
      hasExistingPublication: true,
      existingPublicationName: 'Old Name',
      displayName: 'New Name',
    })

    await publishArticle({
      pdsClient: client,
      draft: {
        title: 'An article',
        description: 'A description',
        markdown: 'Hello world',
        flavor: 'gfm',
      },
    })

    expect(writes).toHaveLength(1)
    const [batch] = writes as [
      {
        $type: string
        collection: string
        rkey: string
        value: Record<string, unknown>
      }[],
    ]
    expect(batch.map(w => w.collection)).toEqual([
      'site.standard.publication',
      'app.bsky.feed.post',
      'site.standard.document',
    ])
    const pubWrite = batch.find(
      w => w.collection === 'site.standard.publication',
    )!
    expect(pubWrite.$type).toBe('com.atproto.repo.applyWrites#update')
    expect(pubWrite.rkey).toBe('existingpub')
    expect(pubWrite.value.name).toBe('New Name')
    // Any other pre-existing fields on the record (e.g. one set through a
    // path this app doesn't write) must be preserved, not clobbered.
    expect(pubWrite.value.url).toBe('https://sunnahsky.com')
  })

  it('does not touch the publication record at all when the name has not drifted', async () => {
    const {client, writes} = makeMockClient({
      hasExistingPublication: true,
      existingPublicationName: 'Unchanged Name',
      displayName: 'Unchanged Name',
    })

    await publishArticle({
      pdsClient: client,
      draft: {
        title: 'An article',
        description: 'A description',
        markdown: 'Hello world',
        flavor: 'gfm',
      },
    })

    const [batch] = writes as [{collection: string}[]]
    expect(batch.map(w => w.collection)).toEqual([
      'app.bsky.feed.post',
      'site.standard.document',
    ])
  })
})

describe('publishArticle - editing an already-published article', () => {
  const EDITING = {
    documentUri: `at://${DID}/site.standard.document/existingdoc` as const,
    documentRkey: 'existingdoc',
    documentCid: 'bafyreioriginaldoccid00000000000000000000000000000',
    publishedAt: '2024-01-01T00:00:00.000Z' as const,
    postUri: `at://${DID}/app.bsky.feed.post/existingpost` as const,
    postRkey: 'existingpost',
  }

  function makeExistingPost(overrides?: Record<string, unknown>) {
    return {
      $type: 'app.bsky.feed.post',
      text: 'Original post text, never touched by an edit',
      createdAt: '2024-01-01T00:00:00.000Z',
      reply: undefined,
      embed: {
        $type: 'app.bsky.embed.external',
        external: {
          $type: 'app.bsky.embed.external#external',
          uri: 'https://sunnahsky.com/article/original',
          title: 'Original title',
          description: 'Original description',
          associatedRefs: [
            {uri: EDITING.documentUri, cid: EDITING.documentCid},
            {
              uri: `at://${DID}/site.standard.publication/existingpub`,
              cid: 'bafyreiexistingpubcid000000000000000000000000000000',
            },
          ],
        },
      },
      ...overrides,
    }
  }

  it('updates the existing document and post in place, preserving publishedAt and setting updatedAt', async () => {
    const {client, writes} = makeMockClient({
      hasExistingPublication: true,
      existingPublicationName: 'Unchanged Name',
      displayName: 'Unchanged Name',
      existingPost: makeExistingPost(),
    })

    const result = await publishArticle({
      pdsClient: client,
      draft: {
        title: 'Edited title',
        description: 'Edited description',
        markdown: 'Edited body content',
        flavor: 'gfm',
      },
      editing: EDITING,
    })

    // No publication write (name unchanged) - only the post and document,
    // both as updates at their existing rkeys, not fresh creates.
    expect(writes).toHaveLength(1)
    const [batch] = writes as [
      {
        $type: string
        collection: string
        rkey: string
        value: Record<string, unknown>
      }[],
    ]
    expect(
      batch.map(w => ({
        $type: w.$type,
        collection: w.collection,
        rkey: w.rkey,
      })),
    ).toEqual([
      {
        $type: 'com.atproto.repo.applyWrites#update',
        collection: 'app.bsky.feed.post',
        rkey: EDITING.postRkey,
      },
      {
        $type: 'com.atproto.repo.applyWrites#update',
        collection: 'site.standard.document',
        rkey: EDITING.documentRkey,
      },
    ])

    const postWrite = batch.find(w => w.collection === 'app.bsky.feed.post')!
    const docWrite = batch.find(w => w.collection === 'site.standard.document')!

    // publishedAt preserved from the original, not reset to now.
    expect(docWrite.value.publishedAt).toBe(EDITING.publishedAt)
    // updatedAt newly set (absent on a fresh publish, present on every edit).
    expect(docWrite.value.updatedAt).toBeTruthy()
    expect(docWrite.value.updatedAt).not.toBe(EDITING.publishedAt)

    // textContent is recomputed fresh from the edited markdown, not carried
    // over from the original record - this only holds because
    // `documentRecord` is rebuilt from current state on every call, not
    // merged into the existing one; worth asserting explicitly since it's
    // exactly the kind of field that would silently go stale if that ever
    // changed.
    expect(docWrite.value.textContent).toBe('Edited body content')

    // The post's own visible text is never touched by an edit, even though
    // the title changed - only its embed/link-preview metadata does.
    expect(postWrite.value.text).toBe(
      'Original post text, never touched by an edit',
    )
    expect(postWrite.value.createdAt).toBe('2024-01-01T00:00:00.000Z')

    // The re-pinned associatedRefs must point at the *new* document's real
    // CID - the same exactness property the create-path test already
    // covers, now exercised on the update path.
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
    expect(docRef?.uri).toBe(EDITING.documentUri)
    expect(result.documentUri).toBe(EDITING.documentUri)

    // Link-preview metadata does refresh to match the edit.
    expect(embed.external.title).toBe('Edited title')
    expect(embed.external.description).toBe('Edited description')
  })

  it('preserves commonmark flavor on edit instead of coercing to the gfm default', async () => {
    const {client, writes} = makeMockClient({
      hasExistingPublication: true,
      existingPublicationName: 'Unchanged Name',
      displayName: 'Unchanged Name',
      existingPost: makeExistingPost(),
    })

    await publishArticle({
      pdsClient: client,
      draft: {
        title: 'Edited title',
        description: 'Edited description',
        markdown: 'Edited body content',
        flavor: 'commonmark',
      },
      editing: EDITING,
    })

    const [batch] = writes as [
      {collection: string; value: {content: {flavor: string}}}[],
    ]
    const docWrite = batch.find(w => w.collection === 'site.standard.document')!
    expect(docWrite.value.content.flavor).toBe('commonmark')
  })

  it('rejects the edit if the companion post cannot be verified against the given document ref', async () => {
    const {client, writes} = makeMockClient({
      hasExistingPublication: true,
      existingPublicationName: 'Unchanged Name',
      displayName: 'Unchanged Name',
      // A post whose associatedRefs point at a DIFFERENT document than the
      // one `editing` claims - simulates a stale/tampered edit reference.
      existingPost: makeExistingPost({
        embed: {
          $type: 'app.bsky.embed.external',
          external: {
            $type: 'app.bsky.embed.external#external',
            uri: 'https://sunnahsky.com/article/other',
            associatedRefs: [
              {
                uri: `at://${DID}/site.standard.document/someotherdoc`,
                cid: 'bafyreisomeotherdoccid0000000000000000000000000000',
              },
            ],
          },
        },
      }),
    })

    await expect(
      publishArticle({
        pdsClient: client,
        draft: {
          title: 'Edited title',
          description: 'Edited description',
          markdown: 'Edited body content',
          flavor: 'gfm',
        },
        editing: EDITING,
      }),
    ).rejects.toThrow("This article's companion post could not be verified")

    // No write should have landed at all.
    expect(writes).toHaveLength(0)
  })
})
