/**
 * Public types for the Lacuna Music API.
 *
 * Field names use `snake_case` to mirror the wire format. Importing code can
 * keep that convention or remap to camelCase as desired.
 */

/**
 * Generation model identifier.
 *
 * Codenames:
 *   - `aether`    — Lacuna Aether (default, versatile flagship)
 *   - `echo`      — Lacuna Echo (fast, duration-controlled, 5–240s)
 *   - `nocturne`  — Lacuna Nocturne (premium vocal & emotion)
 *
 * The `string & {}` fallback keeps untyped values usable so callers don't have
 * to wait for an SDK release to opt in to a new model.
 */
export type Model = 'aether' | 'echo' | 'nocturne' | (string & {})

/** Lead vocal gender hint. */
export type VocalGender = 'm' | 'f'

/**
 * Task lifecycle as exposed to API consumers.
 *
 * The internal pipeline has more granular states (streaming, syncing, etc.)
 * but they all collapse to `pending` from the consumer's perspective.
 */
export type GenerationStatus = 'pending' | 'ready' | 'failed'

/** A single rendered audio track inside a generation task. */
export interface Track {
  id: string
  audio_url: string
  duration: number | null
  title: string | null
  lyrics: string | null
  image_url: string | null
  tags: string | null
  /** Index of this track inside the parent task. */
  index: number
}

/** Error block on a failed task. */
export interface GenerationTaskError {
  code: string
  message: string
}

/** Full generation task as returned by the REST endpoints. */
export interface GenerationTask {
  id: string
  status: GenerationStatus
  model: string | null
  created_at: string
  updated_at: string
  credits_used: number
  credits_refunded: number
  error: GenerationTaskError | null
  tracks: Track[]
}

/**
 * Body for `POST /v1/music/generations`.
 *
 * `lyrics` is required when `instrumental` is `false` (the default).
 * The server enforces this and returns `400 missing_lyrics` if violated.
 */
export interface CreateGenerationParams {
  /** Lyrics in plain text. Up to 5000 chars. Omit for instrumental tracks. */
  lyrics?: string
  /** Style description, e.g. `"pop, female vocal, 120 bpm, energetic"`. */
  style: string
  /** Track title. */
  title: string
  /** When `true`, generate an instrumental track and skip lyrics. */
  instrumental?: boolean
  /** Generation model. Defaults to `aether`. */
  model?: Model
  /** Lead vocal gender hint (aether only). */
  vocal_gender?: VocalGender
  /** Negative style tags to avoid (aether only). */
  negative_tags?: string
  /** 0–1, weight applied to the style prompt (aether only). */
  style_weight?: number
  /** 0–1, allowed weirdness in the output (aether only). */
  weirdness_constraint?: number
  /** 0–1, weight of audio reference (aether only). */
  audio_weight?: number
  /** Target track duration in seconds, 5–240 (echo only). */
  duration?: number
}

/** Common envelope shared by every webhook event. */
export interface WebhookEnvelope<T extends string = string, D = unknown> {
  id: string
  type: T
  /** Unix timestamp in seconds. */
  created: number
  data: D
}

export type JobCompletedEvent = WebhookEnvelope<
  'job.completed',
  {
    task_id: string
    status: 'ready'
    tracks: Track[]
    credits_used: number
    created_at: string
  }
>

export type JobFailedEvent = WebhookEnvelope<
  'job.failed',
  {
    task_id: string
    status: 'failed'
    error: GenerationTaskError
    credits_refunded: number
    created_at: string
  }
>

export type CreditsLowEvent = WebhookEnvelope<
  'credits.low',
  {
    threshold: number
    balance: number
    subscription_credits: number
    onetime_credits: number
  }
>

export type KeyExpiringEvent = WebhookEnvelope<
  'key.expiring',
  {
    api_key_id: string
    prefix: string
    name: string
    expires_at: string
    days_until_expiry: number
  }
>

/** Discriminated union of every webhook event the API emits. */
export type WebhookEvent =
  | JobCompletedEvent
  | JobFailedEvent
  | CreditsLowEvent
  | KeyExpiringEvent

/** Wire format of an error response body. */
export interface ApiErrorPayload {
  error: {
    type: string
    code: string
    message: string
    param?: string
    /** Set when `code === 'model_unavailable'` — the model that's currently circuit-broken. */
    model?: string
    /**
     * Suggested wait time in seconds before retrying.
     *
     * Currently set on `model_unavailable` (503) responses. Mirrors the
     * `Retry-After` header for callers that prefer reading the JSON body.
     */
    retry_after_seconds?: number
  }
}
