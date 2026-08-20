/**
 * Finding 20 (`articles client ui plan.md`, security review of Phase 2a):
 * `com.sunnahsky.richtext.facets.formatting#color.value` has no
 * protocol-level constraint (atproto lexicons have no regex/pattern
 * validator) - any consuming renderer MUST treat it as untrusted input and
 * allowlist it before ever interpolating it into a style. This is that
 * allowlist. Hex only (#RGB / #RRGGBB) - the load-bearing, unambiguous part
 * of the requirement. Never pass a `#color.value` into a style without
 * going through this first.
 */
const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

export function isAllowedColorValue(value: string): boolean {
  return HEX_COLOR.test(value)
}

/** Returns `value` if it passes the allowlist, otherwise `undefined`. */
export function sanitizeColorValue(value: string): string | undefined {
  return isAllowedColorValue(value) ? value : undefined
}
