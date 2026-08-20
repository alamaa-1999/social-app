import {describe, expect, it} from '@jest/globals'

import {isAllowedColorValue, sanitizeColorValue} from '../colorAllowlist'

describe('colorAllowlist', () => {
  it('accepts 6-digit and 3-digit hex colors', () => {
    expect(isAllowedColorValue('#1A2B3C')).toBe(true)
    expect(isAllowedColorValue('#abc')).toBe(true)
    expect(isAllowedColorValue('#ABC')).toBe(true)
  })

  it('rejects non-hex CSS values', () => {
    expect(isAllowedColorValue('red')).toBe(false)
    expect(isAllowedColorValue('rgb(0,0,0)')).toBe(false)
  })

  it('rejects a CSS-injection attempt', () => {
    expect(
      isAllowedColorValue('red; background:url(javascript:alert(1))'),
    ).toBe(false)
  })

  it('rejects malformed hex (wrong length, non-hex chars)', () => {
    expect(isAllowedColorValue('#12345')).toBe(false)
    expect(isAllowedColorValue('#gggggg')).toBe(false)
    expect(isAllowedColorValue('1A2B3C')).toBe(false)
  })

  it('sanitizeColorValue passes through allowed values, drops the rest', () => {
    expect(sanitizeColorValue('#1A2B3C')).toBe('#1A2B3C')
    expect(sanitizeColorValue('red')).toBeUndefined()
  })
})
