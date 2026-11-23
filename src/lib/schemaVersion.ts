/**
 * The wire-contract version this console was built against. Mirrors
 * `SCHEMA_VERSION` in shared/schemas/version.py — change both together.
 *
 * Bridges announce their own in their retained registration. A mismatch is not
 * an error (the backend only warns), but it is the first thing to check when a
 * field reads as missing, so Fleet's bridge view flags it.
 */
export const EXPECTED_SCHEMA_VERSION = '0.0.30'

/** Whether a bridge's announced schema is `min` or newer: the gate for a
 * feature a bridge only understands from that version (Systems › Sensors and
 * the survey both need 0.0.23). Unknown (null, empty, unparseable) is never
 * new enough -- an older bridge sends no version at all. */
export function schemaAtLeast(version: string | null | undefined, min: string): boolean {
  const parse = (v: string) => {
    const parts = v.trim().split('.')
    return parts.length > 0 && parts.every((p) => /^\d+$/.test(p)) ? parts.map(Number) : null
  }
  const have = version ? parse(version) : null
  const want = parse(min)
  if (!have || !want) return false
  for (let i = 0; i < Math.max(have.length, want.length); i++) {
    const a = have[i] ?? 0, b = want[i] ?? 0
    if (a !== b) return a > b
  }
  return true
}
