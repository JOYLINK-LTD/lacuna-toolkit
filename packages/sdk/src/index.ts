/**
 * Public entry point for the Lacuna SDK.
 *
 * The default export is the `Lacuna` client class, mirroring the convention
 * used by `openai`, `stripe`, and other developer SDKs.
 */

export { Lacuna } from './client'
export type { LacunaOptions, FetchLike } from './client'
export { MusicResource, GenerationsResource } from './resources/music'
export type { WaitForOptions } from './resources/music'
export {
  LacunaError,
  APIError,
  APIConnectionError,
  APITimeoutError,
  AuthenticationError,
  BadRequestError,
  InsufficientCreditsError,
  InternalServerError,
  NotFoundError,
  PermissionError,
  PollingTimeoutError,
  RateLimitError,
} from './errors'
export type {
  ApiErrorPayload,
  CreateGenerationParams,
  CreditsLowEvent,
  GenerationStatus,
  GenerationTask,
  GenerationTaskError,
  JobCompletedEvent,
  JobFailedEvent,
  KeyExpiringEvent,
  Model,
  Track,
  VocalGender,
  WebhookEnvelope,
  WebhookEvent,
} from './types'
export { VERSION } from './version'

export {
  Webhooks,
  WebhookSignatureError,
  constructEvent,
  verifySignature,
  isJobCompleted,
  isJobFailed,
  isCreditsLow,
  isKeyExpiring,
  SIGNATURE_HEADER,
  DEFAULT_TOLERANCE_SECONDS,
} from './webhooks'
export type { ConstructEventOptions } from './webhooks'

import { Lacuna } from './client'
export default Lacuna
