// Regex from the go implementation
// https://github.com/bluesky-social/indigo/blob/main/atproto/syntax/handle.go#L10
import {i18n} from '@lingui/core'
import {msg} from '@lingui/core/macro'

import {SUNNAHSKY_HANDLE_SUFFIX} from '#/lib/constants'
import {forceLTR} from '#/lib/strings/bidi'

const VALIDATE_REGEX =
  /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/

export const MAX_SERVICE_HANDLE_LENGTH = 18

export function makeValidHandle(str: string): string {
  if (str.length > 20) {
    str = str.slice(0, 20)
  }
  str = str.toLowerCase()
  return str.replace(/^[^a-z0-9]+/g, '').replace(/[^a-z0-9-]/g, '')
}

export function createFullHandle(name: string, domain: string): string {
  name = (name || '').replace(/[.]+$/, '')
  domain = (domain || '').replace(/^[.]+/, '')
  return `${name}.${domain}`
}

export function isInvalidHandle(handle: string): boolean {
  return handle === 'handle.invalid'
}

/**
 * Whether `handle` is exactly `suffix`, or ends in `.` + `suffix` - the
 * anchored-boundary check every Sunnahsky domain-suffix comparison in this
 * app must go through. An unanchored substring check (e.g.
 * `handle.includes('.guest.')`) would incorrectly match a handle like
 * `alice.guest.someone-elses-server.com` - a legitimate account on an
 * unrelated PDS (this app supports login to any ATproto server, not just
 * ours) that merely happens to contain the same characters without actually
 * being a Sunnahsky domain at all. Requiring exact equality or a leading `.`
 * rules that out. Kept as one shared helper (rather than each call site
 * concatenating and `endsWith`-ing its own suffix) so the anchoring logic
 * itself can't independently drift out of sync the way the suffix constant
 * once did.
 */
function hasAnchoredSuffix(handle: string, suffix: string): boolean {
  return handle === suffix || handle.endsWith('.' + suffix)
}

/**
 * Whether `handle` belongs to Sunnahsky at all - a Striker
 * (`*.sunnahsky.com`) or a Catcher (`*.guest.sunnahsky.com`) alike, since the
 * latter is itself a subdomain of the former. Used to fast-path identity
 * resolution: a Sunnahsky handle's PDS is always Sunnahsky's own server, so
 * there is no need to ask external infrastructure to confirm that.
 */
export function isSunnahskyHandle(handle: string): boolean {
  return hasAnchoredSuffix(handle, SUNNAHSKY_HANDLE_SUFFIX)
}

/**
 * Whether `handle` belongs to a Sunnahsky Catcher (reply-only) account.
 *
 * The PDS guarantees server-side that every Catcher handle ends with
 * `.guest.sunnahsky.com` and that no Striker handle ever does - see
 * `ensureHandleMatchesRole` in the atproto fork, which checks
 * `handle.endsWith(catcherHandleDomain)` where `catcherHandleDomain` is
 * exactly that suffix (`config.ts`: `'.guest' + strikerHandleDomain`). This
 * check mirrors that anchoring via {@link hasAnchoredSuffix}, so a handle
 * from an unrelated PDS correctly never matches.
 *
 * A local `dev-env` PDS (this project's standard local dev/test setup) is
 * configured with `serviceHandleDomains: ['.test', '.example']` rather than
 * `sunnahsky.com`, so a real Catcher handle there ends in `.guest.test`, not
 * `.guest.sunnahsky.com` - the production suffix alone would never match in
 * dev. `.test` is already the established, named "local dev domain" concept
 * in this codebase (see `IS_TEST_USER` in `constants.ts`), so it's checked
 * here the same way.
 */
export function isCatcherHandle(handle: string): boolean {
  return (
    hasAnchoredSuffix(handle, 'guest.' + SUNNAHSKY_HANDLE_SUFFIX) ||
    hasAnchoredSuffix(handle, 'guest.test')
  )
}

export function sanitizeHandle(
  handle: string,
  prefix = '',
  forceLeftToRight = true,
): string {
  const lowercasedWithPrefix = `${prefix}${handle.toLocaleLowerCase()}`
  return isInvalidHandle(handle)
    ? i18n._(msg({message: `⚠Invalid Handle`}))
    : forceLeftToRight
      ? forceLTR(lowercasedWithPrefix)
      : lowercasedWithPrefix
}

export interface IsValidHandle {
  handleChars: boolean
  hyphenStartOrEnd: boolean
  frontLengthNotTooShort: boolean
  frontLengthNotTooLong: boolean
  totalLength: boolean
  overall: boolean
}

// More checks from https://github.com/bluesky-social/atproto/blob/main/packages/pds/src/handle/index.ts#L72
export function validateServiceHandle(
  str: string,
  userDomain: string,
): IsValidHandle {
  const fullHandle = createFullHandle(str, userDomain)

  const results = {
    handleChars:
      !str || (VALIDATE_REGEX.test(fullHandle) && !str.includes('.')),
    hyphenStartOrEnd: !str.startsWith('-') && !str.endsWith('-'),
    frontLengthNotTooShort: str.length >= 3,
    frontLengthNotTooLong: str.length <= MAX_SERVICE_HANDLE_LENGTH,
    totalLength: fullHandle.length <= 253,
  }

  return {
    ...results,
    overall: !Object.values(results).includes(false),
  }
}
