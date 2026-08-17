import {describe, expect, it} from '@jest/globals'

import {isCatcherHandle} from '../handles'

describe('isCatcherHandle', () => {
  it('matches a real Sunnahsky Catcher handle', () => {
    expect(isCatcherHandle('alice.guest.sunnahsky.com')).toBe(true)
  })

  it('does not match a Sunnahsky Striker handle', () => {
    expect(isCatcherHandle('alice.sunnahsky.com')).toBe(false)
  })

  it(
    'does not match a legitimate handle on an unrelated PDS that merely ' +
      'contains the substring ".guest." - regression for the unanchored ' +
      "`.includes('.guest.')` bug found by security review",
    () => {
      /*
       * This app supports login to any ATproto server, not just Sunnahsky's
       * own. `.guest.` here is just this account's own subdomain choice on
       * `someone-elses-server.com` - nothing to do with Sunnahsky's Catcher
       * naming convention. The old unanchored `.includes('.guest.')` check
       * matched this string (it's a real, unmodified substring of it), which
       * would have wrongly gated this foreign account's composer as if it
       * were a Sunnahsky Catcher.
       */
      expect(isCatcherHandle('alice.guest.someone-elses-server.com')).toBe(
        false,
      )
    },
  )

  it('does not match "guest" embedded as a suffix of a longer label', () => {
    /*
     * "myguest" ends in the letters "guest", but isn't its own dot-delimited
     * label - the character immediately before "guest" is "y", not ".".
     */
    expect(isCatcherHandle('alice.myguest.sunnahsky.com')).toBe(false)
  })

  it('matches a Catcher handle on a local dev-env PDS', () => {
    /*
     * dev-env's PDS fixture is configured with `serviceHandleDomains:
     * ['.test', '.example']` rather than `sunnahsky.com`, so a real Catcher
     * handle there ends in `.guest.test` - this must match too, or
     * Catcher-role detection silently fails in local development.
     */
    expect(isCatcherHandle('alice.guest.test')).toBe(true)
  })
})
