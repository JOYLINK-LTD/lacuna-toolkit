/**
 * Single source of truth for the SDK version.
 *
 * Kept in sync with `package.json` manually — bumped together at release time.
 * Surfaced in the `User-Agent` header so server logs can attribute traffic.
 */
export const VERSION = '0.2.0'
