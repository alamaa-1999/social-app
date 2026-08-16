import {beforeEach, describe, expect, it, jest} from '@jest/globals'

jest.mock('#/state/session/clients', () => ({
  getPublicAppviewClient: jest.fn(),
  getSunnahskyPublicPdsClient: jest.fn(),
}))

import {
  getPublicAppviewClient,
  getSunnahskyPublicPdsClient,
} from '#/state/session/clients'
import {com} from '#/lexicons'
import {resolvePdsForIdentifier} from '../pds-detection'

const mockGetPublicAppviewClient = jest.mocked(getPublicAppviewClient)
const mockGetSunnahskyPublicPdsClient = jest.mocked(getSunnahskyPublicPdsClient)

/** A fake `Client` exposing only the `.call` surface `resolvePdsForIdentifier` uses. */
function makeFakeClient(call: jest.Mock) {
  return {call} as unknown as ReturnType<typeof getPublicAppviewClient>
}

describe('resolvePdsForIdentifier', () => {
  let fetchMock: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    fetchMock = jest.fn()
    global.fetch = fetchMock as unknown as typeof fetch
  })

  it('resolves a Striker Sunnahsky handle locally, without touching the public appview or plc.directory', async () => {
    const sunnahskyCall = jest.fn().mockResolvedValue({did: 'did:plc:striker'})
    const appviewCall = jest.fn()
    mockGetSunnahskyPublicPdsClient.mockReturnValue(
      makeFakeClient(sunnahskyCall),
    )
    mockGetPublicAppviewClient.mockReturnValue(makeFakeClient(appviewCall))

    const result = await resolvePdsForIdentifier('alice.sunnahsky.com')

    expect(result).toEqual({
      did: 'did:plc:striker',
      pdsUrl: 'https://sunnahsky.com',
    })
    expect(sunnahskyCall).toHaveBeenCalledWith(
      com.atproto.identity.resolveHandle,
      {handle: 'alice.sunnahsky.com'},
      expect.anything(),
    )
    expect(appviewCall).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('resolves a Catcher (.guest.) Sunnahsky handle locally too', async () => {
    const sunnahskyCall = jest.fn().mockResolvedValue({did: 'did:plc:catcher'})
    mockGetSunnahskyPublicPdsClient.mockReturnValue(
      makeFakeClient(sunnahskyCall),
    )
    mockGetPublicAppviewClient.mockReturnValue(makeFakeClient(jest.fn()))

    const result = await resolvePdsForIdentifier('bob.guest.sunnahsky.com')

    expect(result).toEqual({
      did: 'did:plc:catcher',
      pdsUrl: 'https://sunnahsky.com',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('leaves a non-Sunnahsky handle on the original external path, unchanged', async () => {
    const appviewCall = jest
      .fn()
      .mockResolvedValue({did: 'did:plc:externaluser'})
    const sunnahskyCall = jest.fn()
    mockGetPublicAppviewClient.mockReturnValue(makeFakeClient(appviewCall))
    mockGetSunnahskyPublicPdsClient.mockReturnValue(
      makeFakeClient(sunnahskyCall),
    )
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => ({
        id: 'did:plc:externaluser',
        service: [
          {
            id: '#atproto_pds',
            type: 'AtprotoPersonalDataServer',
            serviceEndpoint: 'https://example-pds.com',
          },
        ],
      }),
    })

    const result = await resolvePdsForIdentifier('alice.bsky.social')

    expect(appviewCall).toHaveBeenCalledWith(
      com.atproto.identity.resolveHandle,
      {handle: 'alice.bsky.social'},
      expect.anything(),
    )
    expect(sunnahskyCall).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledWith(
      'https://plc.directory/did:plc:externaluser',
      expect.anything(),
    )
    expect(result).toEqual({
      did: 'did:plc:externaluser',
      pdsUrl: 'https://example-pds.com',
    })
  })

  it('does not fast-path a handle that merely ends with the Sunnahsky suffix as a raw string, without an actual subdomain boundary', async () => {
    /*
     * Regression test: `endsWith(SUNNAHSKY_HANDLE_SUFFIX)` alone has no
     * subdomain-boundary check, so `alice.evilsunnahsky.com` would also pass
     * it - the raw string ends with "sunnahsky.com" even though it isn't a
     * real Sunnahsky subdomain. Requiring a `.` boundary before the suffix
     * fixes this; this handle must go through the external path instead.
     */
    const appviewCall = jest.fn().mockResolvedValue({did: 'did:plc:lookalike'})
    const sunnahskyCall = jest.fn()
    mockGetPublicAppviewClient.mockReturnValue(makeFakeClient(appviewCall))
    mockGetSunnahskyPublicPdsClient.mockReturnValue(
      makeFakeClient(sunnahskyCall),
    )
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => ({
        id: 'did:plc:lookalike',
        service: [
          {
            id: '#atproto_pds',
            type: 'AtprotoPersonalDataServer',
            serviceEndpoint: 'https://lookalike-pds.com',
          },
        ],
      }),
    })

    const result = await resolvePdsForIdentifier('alice.evilsunnahsky.com')

    expect(appviewCall).toHaveBeenCalledWith(
      com.atproto.identity.resolveHandle,
      {handle: 'alice.evilsunnahsky.com'},
      expect.anything(),
    )
    expect(sunnahskyCall).not.toHaveBeenCalled()
    expect(result).toEqual({
      did: 'did:plc:lookalike',
      pdsUrl: 'https://lookalike-pds.com',
    })
  })

  it('a bare did: identifier falls through to the external DID-doc path regardless of its own PDS', async () => {
    /*
     * A DID carries no domain to fast-path on, even when the DID document it
     * resolves to happens to point back at Sunnahsky - this is the original,
     * untouched slow path, not a Sunnahsky-handle fast path hit.
     */
    const sunnahskyCall = jest.fn()
    mockGetSunnahskyPublicPdsClient.mockReturnValue(
      makeFakeClient(sunnahskyCall),
    )
    mockGetPublicAppviewClient.mockReturnValue(makeFakeClient(jest.fn()))
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => ({
        id: 'did:plc:someuser',
        service: [
          {
            id: '#atproto_pds',
            type: 'AtprotoPersonalDataServer',
            serviceEndpoint: 'https://sunnahsky.com',
          },
        ],
      }),
    })

    const result = await resolvePdsForIdentifier('did:plc:someuser')

    expect(sunnahskyCall).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledWith(
      'https://plc.directory/did:plc:someuser',
      expect.anything(),
    )
    expect(result).toEqual({
      did: 'did:plc:someuser',
      pdsUrl: 'https://sunnahsky.com',
    })
  })

  it('regression test for the incident: a Sunnahsky handle login succeeds even when the public appview hangs forever', async () => {
    /*
     * The incident: public.api.bsky.app took long enough to hang the 20s
     * timeout. A client wired to never resolve stands in for that here - if
     * the fast path regressed back onto the external client, this test would
     * hang until Jest's own test timeout instead of resolving.
     */
    const sunnahskyCall = jest.fn().mockResolvedValue({did: 'did:plc:fast'})
    const appviewCall = jest.fn(() => new Promise(() => {}))
    mockGetSunnahskyPublicPdsClient.mockReturnValue(
      makeFakeClient(sunnahskyCall),
    )
    mockGetPublicAppviewClient.mockReturnValue(makeFakeClient(appviewCall))

    const result = await resolvePdsForIdentifier('alice.sunnahsky.com')

    expect(result).toEqual({
      did: 'did:plc:fast',
      pdsUrl: 'https://sunnahsky.com',
    })
    expect(appviewCall).not.toHaveBeenCalled()
  })

  it('classifies a genuine "handle not found" on the Sunnahsky fast path as null, not a network error', async () => {
    /*
     * Regression test for the bug caught during implementation: the fast path
     * must share the same try/catch error classification as the slow path, so
     * a real not-found response doesn't surface as a false "network error" UI
     * state.
     */
    const notFoundErr = Object.assign(new Error('Unable to resolve handle'), {
      status: 400,
    })
    const sunnahskyCall = jest.fn().mockRejectedValue(notFoundErr)
    mockGetSunnahskyPublicPdsClient.mockReturnValue(
      makeFakeClient(sunnahskyCall),
    )
    mockGetPublicAppviewClient.mockReturnValue(makeFakeClient(jest.fn()))

    const result = await resolvePdsForIdentifier('nobody.sunnahsky.com')

    expect(result).toBeNull()
  })
})
