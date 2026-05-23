import type { ApiErrorPayload } from './types'

/**
 * Base class for every error thrown by this SDK.
 *
 * Catch this if you want a single net for all SDK-originated failures
 * (HTTP errors, network errors, polling timeouts, configuration mistakes).
 */
export class LacunaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LacunaError'
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

/**
 * Thrown when the API returned a non-2xx HTTP response.
 *
 * The concrete subclass reflects the HTTP status — switch on either
 * `instanceof` or `status` depending on which is more readable for you.
 */
export class APIError extends LacunaError {
  /** HTTP status code. */
  readonly status: number
  /** OpenAI-style error type from the response body, e.g. `rate_limit_error`. */
  readonly type: string
  /** Stable machine-readable code, e.g. `rpm_exceeded`. */
  readonly code: string
  /** Field name when the error is tied to a specific request parameter. */
  readonly param: string | undefined
  /** Raw response headers (lowercased keys). */
  readonly headers: Record<string, string>

  constructor(
    status: number,
    payload: ApiErrorPayload['error'],
    headers: Record<string, string> = {}
  ) {
    super(payload.message)
    this.name = 'APIError'
    this.status = status
    this.type = payload.type
    this.code = payload.code
    this.param = payload.param
    this.headers = headers
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

/** 400 — request body or parameters were invalid. */
export class BadRequestError extends APIError {
  constructor(payload: ApiErrorPayload['error'], headers?: Record<string, string>) {
    super(400, payload, headers)
    this.name = 'BadRequestError'
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

/** 401 — missing, invalid, expired, or revoked API key. */
export class AuthenticationError extends APIError {
  constructor(payload: ApiErrorPayload['error'], headers?: Record<string, string>) {
    super(401, payload, headers)
    this.name = 'AuthenticationError'
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

/** 402 — credit balance is too low to perform the operation. */
export class InsufficientCreditsError extends APIError {
  constructor(payload: ApiErrorPayload['error'], headers?: Record<string, string>) {
    super(402, payload, headers)
    this.name = 'InsufficientCreditsError'
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

/** 403 — authenticated, but the user lacks the required subscription tier. */
export class PermissionError extends APIError {
  constructor(payload: ApiErrorPayload['error'], headers?: Record<string, string>) {
    super(403, payload, headers)
    this.name = 'PermissionError'
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

/** 404 — resource does not exist or is not accessible by this API key. */
export class NotFoundError extends APIError {
  constructor(payload: ApiErrorPayload['error'], headers?: Record<string, string>) {
    super(404, payload, headers)
    this.name = 'NotFoundError'
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

/**
 * 429 — rate limit exceeded.
 *
 * Inspect `code` to distinguish `rpm_exceeded` from `concurrent_limit_exceeded`,
 * and use `retryAfter` (parsed from the `Retry-After` header) to back off.
 */
export class RateLimitError extends APIError {
  /** Seconds the server is asking the client to wait, if provided. */
  readonly retryAfter: number | undefined

  constructor(payload: ApiErrorPayload['error'], headers: Record<string, string> = {}) {
    super(429, payload, headers)
    this.name = 'RateLimitError'
    const raw = headers['retry-after']
    const parsed = raw ? Number(raw) : NaN
    this.retryAfter = Number.isFinite(parsed) ? parsed : undefined
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

/** 5xx — internal server error or upstream provider failure. */
export class InternalServerError extends APIError {
  constructor(
    status: number,
    payload: ApiErrorPayload['error'],
    headers?: Record<string, string>
  ) {
    super(status, payload, headers)
    this.name = 'InternalServerError'
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

/**
 * 503 — server is temporarily unavailable.
 *
 * Inspect `code` to distinguish concrete reasons. `retryAfter` is parsed from
 * the `Retry-After` header (or the `retry_after_seconds` body field as
 * fallback) so callers can back off without re-parsing the response.
 */
export class ServiceUnavailableError extends APIError {
  /** Seconds the server is asking the client to wait, if provided. */
  readonly retryAfter: number | undefined

  constructor(payload: ApiErrorPayload['error'], headers: Record<string, string> = {}) {
    super(503, payload, headers)
    this.name = 'ServiceUnavailableError'
    this.retryAfter = parseRetryAfter(headers, payload.retry_after_seconds)
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

/**
 * 503 `model_unavailable` — the requested generation model is circuit-broken.
 *
 * The SDK does NOT automatically fall back to a different model: each model
 * has a different credit cost, so silently switching would charge the caller
 * for a model they didn't ask for. Instead, catch this error and decide
 * which model to retry with (or wait `retryAfterSeconds` and retry the same one).
 *
 * @example
 * ```ts
 * try {
 *   await lacuna.music.generations.create({ model: 'aether', style, title })
 * } catch (err) {
 *   if (err instanceof ModelUnavailableError) {
 *     // err.model — which model is currently down ('aether' here)
 *     // err.retryAfterSeconds — server's suggested cool-down
 *     // pick a different model (e.g. 'echo' / 'nocturne') and retry
 *   }
 * }
 * ```
 */
export class ModelUnavailableError extends ServiceUnavailableError {
  /** The model codename that is currently unavailable. */
  readonly model: string
  /**
   * Server-suggested wait in seconds before the model recovers.
   *
   * Same value as `retryAfter` on the parent class; named explicitly here
   * because it's the load-bearing field for this error type.
   */
  readonly retryAfterSeconds: number

  constructor(payload: ApiErrorPayload['error'], headers: Record<string, string> = {}) {
    super(payload, headers)
    this.name = 'ModelUnavailableError'
    this.model = payload.model ?? ''
    this.retryAfterSeconds = this.retryAfter ?? 0
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

function parseRetryAfter(
  headers: Record<string, string>,
  bodyFallback: number | undefined
): number | undefined {
  const raw = headers['retry-after']
  if (raw) {
    const parsed = Number(raw)
    if (Number.isFinite(parsed)) return parsed
  }
  return typeof bodyFallback === 'number' && Number.isFinite(bodyFallback)
    ? bodyFallback
    : undefined
}

/** Network failure — DNS error, TCP reset, fetch threw, etc. */
export class APIConnectionError extends LacunaError {
  override readonly cause: unknown
  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'APIConnectionError'
    this.cause = cause
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

/** Request exceeded the configured `timeout`. */
export class APITimeoutError extends LacunaError {
  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`)
    this.name = 'APITimeoutError'
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

/** Polling helper exceeded its `timeout`. */
export class PollingTimeoutError extends LacunaError {
  readonly taskId: string
  constructor(taskId: string, timeoutMs: number) {
    super(`Task ${taskId} did not finish within ${timeoutMs}ms`)
    this.name = 'PollingTimeoutError'
    this.taskId = taskId
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

const FALLBACK_PAYLOAD: ApiErrorPayload['error'] = {
  type: 'api_error',
  code: 'unknown_error',
  message: 'The server returned an error response without a parseable body.',
}

/**
 * Build the right `APIError` subclass for an HTTP status + parsed body.
 *
 * Falls back to a generic payload when the body could not be parsed.
 */
export function createAPIError(
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
): APIError {
  const payload =
    body && typeof body === 'object' && 'error' in body
      ? ((body as ApiErrorPayload).error ?? FALLBACK_PAYLOAD)
      : FALLBACK_PAYLOAD

  switch (status) {
    case 400:
      return new BadRequestError(payload, headers)
    case 401:
      return new AuthenticationError(payload, headers)
    case 402:
      return new InsufficientCreditsError(payload, headers)
    case 403:
      return new PermissionError(payload, headers)
    case 404:
      return new NotFoundError(payload, headers)
    case 429:
      return new RateLimitError(payload, headers)
    case 503:
      if (payload.code === 'model_unavailable') {
        return new ModelUnavailableError(payload, headers)
      }
      return new ServiceUnavailableError(payload, headers)
    default:
      if (status >= 500) return new InternalServerError(status, payload, headers)
      return new APIError(status, payload, headers)
  }
}
