/**
 * The wire-contract version this console was built against. Mirrors
 * `SCHEMA_VERSION` in shared/schemas/version.py — change both together.
 *
 * Bridges announce their own in their retained registration. A mismatch is not
 * an error (the backend only warns), but it is the first thing to check when a
 * field reads as missing, so Fleet's bridge view flags it.
 */
export const EXPECTED_SCHEMA_VERSION = '0.0.19'
