/**
 * Single source of truth for the SDK version.
 *
 * The real value is injected at build time by tsup (`define.__SDK_VERSION__`,
 * read straight from `package.json`) so this can never drift out of sync with
 * the published version — it silently did, shipping `0.2.0` User-Agents for
 * every `0.3.x` release.
 *
 * The literal below is only the un-bundled fallback (tests, `tsx` on source).
 *
 * Surfaced in the `User-Agent` header so server logs can attribute traffic.
 */
declare const __SDK_VERSION__: string | undefined

export const VERSION: string =
  typeof __SDK_VERSION__ === 'string' ? __SDK_VERSION__ : '0.0.0-dev'
