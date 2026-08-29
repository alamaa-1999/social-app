import {describe, expect, it} from '@jest/globals'

import {
  convertBskyAppUrlIfNeeded,
  isExternalUrl,
  isSunnahskyArticleUrl,
} from '../url-helpers'

describe('isSunnahskyArticleUrl', () => {
  it("matches a real article URL, mirroring articleUrl()'s own exact shape", () => {
    expect(
      isSunnahskyArticleUrl(
        'https://sunnahsky.com/article/did:plc:abc123/3jzfcijpj2z2a',
      ),
    ).toBe(true)
  })

  it('does not match a Sunnahsky URL that is not an article', () => {
    expect(isSunnahskyArticleUrl('https://sunnahsky.com/profile/alice')).toBe(
      false,
    )
  })

  it('does not match an unrelated host that merely contains "/article/" in its path', () => {
    expect(isSunnahskyArticleUrl('https://tracker.example/article/x/y')).toBe(
      false,
    )
  })

  it('does not match a bare-apex-lookalike host (subdomain confusion)', () => {
    expect(
      isSunnahskyArticleUrl('https://sunnahsky.com.evil.example/article/x/y'),
    ).toBe(false)
  })
})

describe('convertBskyAppUrlIfNeeded - Sunnahsky article URLs', () => {
  it('converts a Sunnahsky article URL to a relative path', () => {
    expect(
      convertBskyAppUrlIfNeeded(
        'https://sunnahsky.com/article/did:plc:abc123/3jzfcijpj2z2a',
      ),
    ).toBe('/article/did:plc:abc123/3jzfcijpj2z2a')
  })

  it(
    'the converted path is no longer treated as external - this is the ' +
      "actual mechanism StandardSiteEmbed's existing card relies on to " +
      'open the in-app reader, not a separate isExternalUrl change',
    () => {
      const converted = convertBskyAppUrlIfNeeded(
        'https://sunnahsky.com/article/did:plc:abc123/3jzfcijpj2z2a',
      )
      expect(isExternalUrl(converted)).toBe(false)
    },
  )

  it('leaves an unrelated external URL untouched', () => {
    const url = 'https://example.com/whatever'
    expect(convertBskyAppUrlIfNeeded(url)).toBe(url)
  })
})
