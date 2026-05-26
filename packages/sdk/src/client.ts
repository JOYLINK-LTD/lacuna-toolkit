import { Buffer } from 'node:buffer'
import { setTimeout as sleep } from 'node:timers/promises'

import {
  APIConnectionError,
  APIError,
  APITimeoutError,
  ModelUnavailableError,
  RateLimitError,
  createAPIError,
} from './errors'
import { MusicResource } from './resources/music'
import { VERSION } from './version'

/** A `fetch`-compatible function. Defaults to `globalThis.fetch`. */
export type FetchLike = typeof globalThis.fetch

export interface LacunaOptions {
  /**
   * API key issued from the Lacuna dashboard.
   *
   * Falls back to `process.env.LACUNA_API_KEY` when omitted.
   */
  apiKey?: string

  /**
   * Override the API base URL. Useful for staging environments or self-hosted
   * deployments. The path component (`/api/v1`) is included by default.
   *
   * Defaults to `process.env.LACUNA_BASE_URL` or `https://lacuna.ai/api/v1`.
   */
  baseURL?: string

  /** Request timeout in milliseconds. Defaults to 60_000. */
  timeout?: number

  /**
   * Maximum number of automatic retries for `429` and `5xx` responses.
   *
   * Backoff respects the server's `Retry-After` header when present and falls
   * back to exponential backoff (500ms × 2^attempt, jittered).
   *
   * Defaults to `2`. Set to `0` to disable retries.
   */
  maxRetries?: number

  /** Custom `fetch` implementation. Defaults to the global `fetch`. */
  fetch?: FetchLike

  /** Extra headers merged into every request. */
  defaultHeaders?: Record<string, string>
}

interface RequestOptions {
  method: 'GET' | 'POST' | 'DELETE' | 'PATCH' | 'PUT'
  path: string
  body?: unknown
  query?: Record<string, string | number | boolean | undefined>
  /** Override per-call timeout. */
  timeout?: number
  /** External cancellation. */
  signal?: AbortSignal
  /** Override per-call retry budget. */
  maxRetries?: number
  /** Extra headers merged into this single request. */
  headers?: Record<string, string>
}

const DEFAULT_BASE_URL = 'https://lacuna.ai/api/v1'
const DEFAULT_TIMEOUT_MS = 60_000
const DEFAULT_MAX_RETRIES = 2
const RETRY_BASE_MS = 500

/**
 * Lacuna Music API client.
 *
 * @example
 * ```ts
 * import Lacuna from 'lacuna-sdk'
 *
 * const lacuna = new Lacuna({ apiKey: process.env.LACUNA_API_KEY })
 * const task = await lacuna.music.generations.create({
 *   style: 'lofi hip hop, mellow piano, 70 bpm',
 *   title: 'Late Night Study',
 *   instrumental: true,
 * })
 * const finished = await lacuna.music.generations.waitFor(task.id)
 * console.log(finished.tracks[0]?.audio_url)
 * ```
 */
export class Lacuna {
  readonly apiKey: string
  readonly baseURL: string
  readonly timeout: number
  readonly maxRetries: number
  readonly defaultHeaders: Record<string, string>

  private readonly fetchImpl: FetchLike

  /** Music generation endpoints. */
  readonly music: MusicResource

  constructor(options: LacunaOptions = {}) {
    const apiKey = options.apiKey ?? process.env.LACUNA_API_KEY ?? ''
    if (!apiKey) {
      throw new Error(
        'Missing API key. Pass `apiKey` to `new Lacuna({ apiKey })` or set the `LACUNA_API_KEY` environment variable.'
      )
    }

    const fetchImpl = options.fetch ?? globalThis.fetch
    if (typeof fetchImpl !== 'function') {
      throw new Error(
        'No `fetch` implementation found. Pass one via `new Lacuna({ fetch })` or upgrade to Node 18+.'
      )
    }

    this.apiKey = apiKey
    this.baseURL = (options.baseURL ?? process.env.LACUNA_BASE_URL ?? DEFAULT_BASE_URL).replace(
      /\/+$/,
      ''
    )
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT_MS
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES
    this.defaultHeaders = options.defaultHeaders ?? {}
    this.fetchImpl = fetchImpl

    this.music = new MusicResource(this)
  }

  /**
   * Execute an arbitrary request against the API.
   *
   * Most callers should use the typed resources (`client.music.generations.*`).
   * This is exposed for forward-compat with endpoints that ship before the SDK
   * adds dedicated wrappers.
   */
  async request<T>(opts: RequestOptions): Promise<T> {
    const url = this.buildURL(opts.path, opts.query)
    const maxRetries = opts.maxRetries ?? this.maxRetries
    const timeout = opts.timeout ?? this.timeout

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: 'application/json',
      'User-Agent': buildUserAgent(),
      ...this.defaultHeaders,
      ...opts.headers,
    }

    let body: string | undefined
    if (opts.body !== undefined) {
      body = JSON.stringify(opts.body)
      headers['Content-Type'] = 'application/json'
    }

    let attempt = 0
    let lastError: unknown

    while (attempt <= maxRetries) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeout)

      const onExternalAbort = () => controller.abort()
      opts.signal?.addEventListener('abort', onExternalAbort, { once: true })

      try {
        const response = await this.fetchImpl(url, {
          method: opts.method,
          headers,
          body,
          signal: controller.signal,
        })

        const responseHeaders = headersToObject(response.headers)
        const text = await response.text()
        const parsed = text ? safeJSON(text) : undefined

        if (response.ok) {
          return parsed as T
        }

        const error = createAPIError(response.status, parsed, responseHeaders)

        if (attempt < maxRetries && shouldRetry(response.status, error)) {
          const wait =
            error instanceof RateLimitError && error.retryAfter !== undefined
              ? error.retryAfter * 1000
              : backoff(attempt)
          await sleep(wait)
          attempt++
          continue
        }

        throw error
      } catch (err) {
        if (err instanceof APIError) throw err

        if (isAbortError(err)) {
          if (opts.signal?.aborted) {
            // External cancellation — surface the original AbortError.
            throw err
          }
          lastError = new APITimeoutError(timeout)
        } else {
          lastError = new APIConnectionError(
            err instanceof Error ? err.message : 'Network request failed',
            err
          )
        }

        if (attempt < maxRetries) {
          await sleep(backoff(attempt))
          attempt++
          continue
        }

        throw lastError
      } finally {
        clearTimeout(timer)
        opts.signal?.removeEventListener('abort', onExternalAbort)
      }
    }

    // Loop exited only via `continue`; this is unreachable but satisfies TS.
    throw lastError ?? new APIConnectionError('Request failed after exhausting retries.')
  }

  private buildURL(
    path: string,
    query?: Record<string, string | number | boolean | undefined>
  ): string {
    const normalized = path.startsWith('/') ? path : `/${path}`
    const url = new URL(`${this.baseURL}${normalized}`)
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined) continue
        url.searchParams.set(key, String(value))
      }
    }
    return url.toString()
  }
}

function buildUserAgent(): string {
  const node = typeof process !== 'undefined' && process.versions?.node ? process.versions.node : 'unknown'
  const platform = typeof process !== 'undefined' && process.platform ? process.platform : 'unknown'
  return `lacuna-sdk/${VERSION} node/${node} (${platform})`
}

function headersToObject(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  headers.forEach((value, key) => {
    out[key.toLowerCase()] = value
  })
  return out
}

function safeJSON(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function shouldRetry(status: number, error: APIError): boolean {
  if (status === 429) return true
  // model_unavailable 是几分钟级的熔断，自动重试没意义 —— 把决策交给用户
  // （切别的模型，或等 retryAfterSeconds 后自己重试）。
  if (error instanceof ModelUnavailableError) return false
  if (status >= 500 && status < 600) return true
  return false
}

function backoff(attempt: number): number {
  const exp = RETRY_BASE_MS * 2 ** attempt
  // Full jitter: random value in [0, exp]
  return Math.floor(Math.random() * exp)
}

function isAbortError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === 'AbortError' || err.message.toLowerCase().includes('aborted'))
  )
}

// Re-export so consumers don't have to dig into ./errors when catching.
export { APIError, RateLimitError, APIConnectionError, APITimeoutError }

// Avoid an "unused" lint hit on the Buffer import — kept available for users
// who construct multipart bodies via the public `request` escape hatch.
void Buffer
