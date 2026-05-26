/**
 * Webhook signature verification.
 *
 * Lacuna webhooks are signed in the same shape as Stripe's: a single header
 * carries a unix timestamp and an HMAC-SHA256 of `${timestamp}.${rawBody}`,
 * keyed by the per-endpoint secret shown once at endpoint creation.
 *
 * @example
 * ```ts
 * import { Webhooks } from 'lacuna-sdk/webhooks'
 *
 * const event = Webhooks.constructEvent(
 *   rawBody, // string — the raw request body, NOT JSON.parse'd
 *   request.headers['x-lacuna-signature'],
 *   process.env.LACUNA_WEBHOOK_SECRET,
 * )
 *
 * if (event.type === 'job.completed') {
 *   console.log(event.data.tracks)
 * }
 * ```
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import { Buffer } from 'node:buffer'

import { LacunaError } from './errors'
import type { WebhookEvent } from './types'

export const SIGNATURE_HEADER = 'x-lacuna-signature'

/** Default acceptance window for the signed timestamp (5 minutes). */
export const DEFAULT_TOLERANCE_SECONDS = 300

export class WebhookSignatureError extends LacunaError {
  constructor(message: string) {
    super(message)
    this.name = 'WebhookSignatureError'
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export interface ConstructEventOptions {
  /**
   * Maximum age of the signed timestamp in seconds. Requests older than this
   * are rejected to defend against replay attacks. Defaults to 300 (5 minutes).
   */
  toleranceSeconds?: number
  /**
   * Override the "current" time when verifying. Useful in tests; in production,
   * leave this unset.
   */
  now?: () => number
}

interface ParsedSignatureHeader {
  timestamp: number
  signatures: string[]
}

/**
 * Verify a webhook signature and return the parsed event.
 *
 * @param payload  Raw request body, exactly as received. Must be a string or
 *                 `Buffer` — pre-parsed objects can't be verified because the
 *                 HMAC was computed against the original bytes.
 * @param header   Value of the `X-Lacuna-Signature` header.
 * @param secret   The endpoint secret shown once at creation.
 *
 * @throws {@link WebhookSignatureError} when the header is malformed, the
 * timestamp is outside the tolerance window, or no signature matches.
 */
export function constructEvent(
  payload: string | Buffer,
  header: string | string[] | undefined,
  secret: string,
  options: ConstructEventOptions = {}
): WebhookEvent {
  if (!header) {
    throw new WebhookSignatureError('Missing X-Lacuna-Signature header.')
  }
  if (Array.isArray(header)) {
    throw new WebhookSignatureError('Multiple X-Lacuna-Signature headers received.')
  }
  if (!secret) {
    throw new WebhookSignatureError('Webhook secret is required.')
  }

  const tolerance = options.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS
  const now = (options.now ?? defaultNow)()
  const parsed = parseSignatureHeader(header)

  const drift = Math.abs(now - parsed.timestamp)
  if (drift > tolerance) {
    throw new WebhookSignatureError(
      `Timestamp outside the tolerance window (drift ${drift}s, tolerance ${tolerance}s).`
    )
  }

  const bodyString = typeof payload === 'string' ? payload : payload.toString('utf8')
  const expected = createHmac('sha256', secret)
    .update(`${parsed.timestamp}.${bodyString}`)
    .digest('hex')

  const matched = parsed.signatures.some((candidate) => safeEqualHex(candidate, expected))
  if (!matched) {
    throw new WebhookSignatureError('No signature matched the expected value.')
  }

  let event: WebhookEvent
  try {
    event = JSON.parse(bodyString) as WebhookEvent
  } catch {
    throw new WebhookSignatureError('Signature valid but request body is not valid JSON.')
  }

  return event
}

/**
 * Verify a signature without parsing the body.
 *
 * Use this when you've already parsed the body upstream (e.g. by a framework
 * middleware) and only need the boolean.
 */
export function verifySignature(
  payload: string | Buffer,
  header: string | string[] | undefined,
  secret: string,
  options: ConstructEventOptions = {}
): boolean {
  try {
    constructEvent(payload, header, secret, options)
    return true
  } catch {
    return false
  }
}

/**
 * Type guard helpers for narrowing inside webhook handlers.
 *
 * @example
 * ```ts
 * if (Webhooks.isJobCompleted(event)) {
 *   // event.data is typed as the JobCompletedEvent payload here
 * }
 * ```
 */
export const isJobCompleted = (event: WebhookEvent): event is Extract<WebhookEvent, { type: 'job.completed' }> =>
  event.type === 'job.completed'

export const isJobFailed = (event: WebhookEvent): event is Extract<WebhookEvent, { type: 'job.failed' }> =>
  event.type === 'job.failed'

export const isCreditsLow = (event: WebhookEvent): event is Extract<WebhookEvent, { type: 'credits.low' }> =>
  event.type === 'credits.low'

export const isKeyExpiring = (event: WebhookEvent): event is Extract<WebhookEvent, { type: 'key.expiring' }> =>
  event.type === 'key.expiring'

/**
 * Namespaced surface for ergonomic imports:
 *
 * ```ts
 * import { Webhooks } from 'lacuna-sdk/webhooks'
 * Webhooks.constructEvent(...)
 * ```
 */
export const Webhooks = {
  constructEvent,
  verifySignature,
  isJobCompleted,
  isJobFailed,
  isCreditsLow,
  isKeyExpiring,
  SignatureError: WebhookSignatureError,
  HEADER: SIGNATURE_HEADER,
} as const

export type { WebhookEvent } from './types'

function parseSignatureHeader(header: string): ParsedSignatureHeader {
  let timestamp: number | undefined
  const signatures: string[] = []

  for (const part of header.split(',')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const key = part.slice(0, eq).trim()
    const value = part.slice(eq + 1).trim()
    if (!value) continue

    if (key === 't') {
      const parsedTs = Number.parseInt(value, 10)
      if (Number.isFinite(parsedTs)) timestamp = parsedTs
    } else if (key === 'v1') {
      signatures.push(value)
    }
  }

  if (timestamp === undefined) {
    throw new WebhookSignatureError('Signature header is missing the `t=` component.')
  }
  if (signatures.length === 0) {
    throw new WebhookSignatureError('Signature header is missing a `v1=` component.')
  }

  return { timestamp, signatures }
}

function defaultNow(): number {
  return Math.floor(Date.now() / 1000)
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let bufA: Buffer
  let bufB: Buffer
  try {
    bufA = Buffer.from(a, 'hex')
    bufB = Buffer.from(b, 'hex')
  } catch {
    return false
  }
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}
