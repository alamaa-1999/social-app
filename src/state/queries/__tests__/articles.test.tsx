/*
 * See `lib/api/__tests__/computeCid.test.ts` - this repo ships global manual
 * mocks for `multiformats/cid`/`multiformats/hashes/hasher` so unrelated
 * tests don't pull in real crypto. `useArticleDocumentQuery`'s tests below
 * parse mock records through the real `site.standard.document` schema,
 * which strictly validates CID strings - real implementations are needed to
 * compute genuinely valid ones rather than hand-copying string literals.
 */
jest.unmock('multiformats/cid')
jest.unmock('multiformats/hashes/hasher')

import {type AtUriString, type DidString} from '@atproto/syntax'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {renderHook, waitFor} from '@testing-library/react-native'

import {computeCid} from '#/lib/api/computeCid'
import {usePdsClient} from '#/state/session'
import {type app} from '#/lexicons'
import {useArticleDocumentQuery} from '../articles'
import {selectGenuineCompanionPosts} from '../articles-companion'

// Lightweight stubs, not `jest.requireActual` - the real module transitively
// pulls in react-native-reanimated/Worklets, uninitialized in this test
// environment. `useArticleDocumentQuery` only calls `usePdsClient`; the
// other two are never invoked by anything this file exercises.
jest.mock('#/state/session', () => ({
  usePdsClient: jest.fn(),
  useAppviewClient: jest.fn(),
  useSession: jest.fn(),
}))

const mockUsePdsClient = usePdsClient as jest.Mock

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

describe('useArticleDocumentQuery', () => {
  const DOC_URI: AtUriString = 'at://did:plc:owner/site.standard.document/doc1'
  // Real, computed CIDs - `site.standard.document`'s schema strictly
  // validates CID format, so a hand-copied placeholder string fails to
  // parse for reasons unrelated to whatever the test is actually checking.
  let recordCid: string
  let bskyPostRefCid: string

  beforeAll(async () => {
    recordCid = await computeCid({a: 'record cid'})
    bskyPostRefCid = await computeCid({a: 'bskyPostRef cid'})
  })

  function renderWithClient(mockCall: jest.Mock) {
    mockUsePdsClient.mockReturnValue({call: mockCall})
    const queryClient = new QueryClient({
      defaultOptions: {queries: {retry: false}},
    })
    const wrapper = ({children}: {children: React.ReactNode}) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    return renderHook(() => useArticleDocumentQuery(DOC_URI), {wrapper})
  }

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('errors when the record fails to parse as a site.standard.document', async () => {
    const mockCall = jest.fn().mockResolvedValue({
      uri: DOC_URI,
      cid: recordCid,
      // Missing required fields (`title`, `publishedAt`, `site`) - not a
      // valid site.standard.document.
      value: {$type: 'site.standard.document'},
    })

    const {result} = renderWithClient(mockCall)

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toBe('Could not parse this article')
  })

  it('errors when the document has no companion post to edit against', async () => {
    const mockCall = jest.fn().mockResolvedValue({
      uri: DOC_URI,
      cid: recordCid,
      value: {
        $type: 'site.standard.document',
        title: 'A valid document, missing bskyPostRef',
        publishedAt: '2026-01-01T00:00:00.000Z',
        site: 'at://did:plc:owner/site.standard.publication/pub1',
      },
    })

    const {result} = renderWithClient(mockCall)

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toBe(
      'This article has no companion post to edit against',
    )
  })

  it('errors when the record has no cid', async () => {
    const mockCall = jest.fn().mockResolvedValue({
      uri: DOC_URI,
      cid: undefined,
      value: {
        $type: 'site.standard.document',
        title: 'A valid document',
        publishedAt: '2026-01-01T00:00:00.000Z',
        site: 'at://did:plc:owner/site.standard.publication/pub1',
        bskyPostRef: {
          uri: 'at://did:plc:owner/app.bsky.feed.post/post1',
          cid: bskyPostRefCid,
        },
      },
    })

    const {result} = renderWithClient(mockCall)

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toBe('This article record has no cid')
  })

  it('succeeds for a valid document with a companion post', async () => {
    const mockCall = jest.fn().mockResolvedValue({
      uri: DOC_URI,
      cid: recordCid,
      value: {
        $type: 'site.standard.document',
        title: 'A valid document',
        publishedAt: '2026-01-01T00:00:00.000Z',
        site: 'at://did:plc:owner/site.standard.publication/pub1',
        bskyPostRef: {
          uri: 'at://did:plc:owner/app.bsky.feed.post/post1',
          cid: bskyPostRefCid,
        },
      },
    })

    const {result} = renderWithClient(mockCall)

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.document.title).toBe('A valid document')
  })
})
