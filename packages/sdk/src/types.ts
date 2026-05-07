/**
 * Public types for the Lacuna Music API.
 *
 * Field names use `snake_case` to mirror the wire format. Importing code can
 * keep that convention or remap to camelCase as desired.
 */

/**
 * Generation model identifier.
 *
 * `aether` is the codename for the current production engine
 * (display name: **Lacuna Aether**). New models are added here as they ship;
 * the `string & {}` fallback keeps untyped values usable so callers don't have
 * to wait for an SDK release to opt in to a new model.
 */
export type Model = 'aether' | (string & {})

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
  /** Generation model. Defaults to `aether` (Lacuna Aether). */
  model?: Model
  /** Lead vocal gender hint. */
  vocal_gender?: VocalGender
  /** Negative style tags to avoid. */
  negative_tags?: string
  /** 0–1, weight applied to the style prompt. */
  style_weight?: number
  /** 0–1, allowed weirdness in the output. */
  weirdness_constraint?: number
  /** 0–1, weight of audio reference (when supported by the model). */
  audio_weight?: number
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
  }
}
