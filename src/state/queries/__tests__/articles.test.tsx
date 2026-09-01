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
import {getSunnahskyPublicPdsClient} from '#/state/session/clients'
import {useArticleDocumentQuery, useAuthorArticlesQuery} from '../articles'

// Lightweight stubs, not `jest.requireActual` - the real module transitively
// pulls in react-native-reanimated/Worklets, uninitialized in this test
// environment. `useArticleDocumentQuery` only calls `usePdsClient`; the
// other two are never invoked by anything this file exercises.
jest.mock('#/state/session', () => ({
  usePdsClient: jest.fn(),
  useAppviewClient: jest.fn(),
  useSession: jest.fn(),
}))

// `useAuthorArticlesQuery` calls this module-level factory directly (it's
// unauthenticated by design - see its own doc comment), not the `usePdsClient`
// hook above.
jest.mock('#/state/session/clients', () => ({
  getSunnahskyPublicPdsClient: jest.fn(),
}))

const mockUsePdsClient = usePdsClient as jest.Mock
const mockGetSunnahskyPublicPdsClient = getSunnahskyPublicPdsClient as jest.Mock

describe('useAuthorArticlesQuery', () => {
  const DID = 'did:plc:owner' as DidString

  function renderWithClient(mockCall: jest.Mock) {
    mockGetSunnahskyPublicPdsClient.mockReturnValue({call: mockCall})
    const queryClient = new QueryClient({
      defaultOptions: {queries: {retry: false}},
    })
    const wrapper = ({children}: {children: React.ReactNode}) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    return renderHook(() => useAuthorArticlesQuery(DID), {wrapper})
  }

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('lists documents straight off listRecords, skipping unparseable ones', async () => {
    const mockCall = jest.fn().mockResolvedValue({
      records: [
        {
          uri: 'at://did:plc:owner/site.standard.document/doc1' as AtUriString,
          cid: 'bafyreidoc1cid00000000000000000000000000000000000000',
          value: {
            $type: 'site.standard.document',
            title: 'A real article',
            publishedAt: '2026-01-01T00:00:00.000Z',
            site: 'at://did:plc:owner/site.standard.publication/pub1',
          },
        },
        {
          uri: 'at://did:plc:owner/site.standard.document/doc2' as AtUriString,
          cid: 'bafyreidoc2cid00000000000000000000000000000000000000',
          // Missing required fields - not a valid site.standard.document.
          value: {$type: 'site.standard.document'},
        },
      ],
    })

    const {result} = renderWithClient(mockCall)

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(1)
    expect(result.current.data?.[0].doc.title).toBe('A real article')
  })

  it('does not require a bskyPostRef to list a document', async () => {
    // A document published entirely without a Bluesky companion post - via a
    // different Standard.site client, or before this app tethered one - is
    // still a real article this account published, and should still show.
    const mockCall = jest.fn().mockResolvedValue({
      records: [
        {
          uri: 'at://did:plc:owner/site.standard.document/doc1' as AtUriString,
          cid: 'bafyreidoc1cid00000000000000000000000000000000000000',
          value: {
            $type: 'site.standard.document',
            title: 'No companion post',
            publishedAt: '2026-01-01T00:00:00.000Z',
            site: 'https://example.com',
          },
        },
      ],
    })

    const {result} = renderWithClient(mockCall)

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(1)
  })
})

describe('useArticleDocumentQuery', () => {
  const DOC_URI: AtUriString = 'at://did:plc:owner/site.standard.document/doc1'
  // Real, computed CIDs - `site.standard.document`'s schema strictly
  // validates CID format, so a hand-copied placeholder string fails to
  // parse for reasons unrelated to whatever the test is actually checking.
  let recordCid: string

  beforeAll(async () => {
    recordCid = await computeCid({a: 'record cid'})
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

  it('succeeds for a valid document with no companion post - deleting the post must not break editing', async () => {
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

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.document.title).toBe(
      'A valid document, missing bskyPostRef',
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
      },
    })

    const {result} = renderWithClient(mockCall)

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toBe('This article record has no cid')
  })

  it('succeeds for a valid document with just the required fields', async () => {
    const mockCall = jest.fn().mockResolvedValue({
      uri: DOC_URI,
      cid: recordCid,
      value: {
        $type: 'site.standard.document',
        title: 'A valid document',
        publishedAt: '2026-01-01T00:00:00.000Z',
        site: 'at://did:plc:owner/site.standard.publication/pub1',
      },
    })

    const {result} = renderWithClient(mockCall)

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.document.title).toBe('A valid document')
  })
})
