import { setTimeout as sleep } from 'node:timers/promises'

import type { Lacuna } from '../client'
import { PollingTimeoutError } from '../errors'
import type { CreateGenerationParams, GenerationTask } from '../types'

export interface WaitForOptions {
  /** Polling interval in milliseconds. Defaults to 5000. */
  pollInterval?: number
  /** Total time budget in milliseconds. Defaults to 600_000 (10 minutes). */
  timeout?: number
  /** External cancellation. */
  signal?: AbortSignal
}

/**
 * `client.music.generations` — create, retrieve, and await music tasks.
 */
export class GenerationsResource {
  constructor(private readonly client: Lacuna) {}

  /**
   * Create a music generation task.
   *
   * Returns immediately with a task in `pending` state. Subscribe to the
   * `job.completed` webhook or call {@link waitFor} to receive the final tracks.
   *
   * Credits are deducted on this call and refunded automatically if the
   * upstream provider fails.
   */
  async create(params: CreateGenerationParams): Promise<GenerationTask> {
    return this.client.request<GenerationTask>({
      method: 'POST',
      path: '/music/generations',
      body: params,
    })
  }

  /**
   * Fetch the current state of a generation task.
   *
   * Inexpensive — call as often as you like; rate limited per API key.
   */
  async retrieve(id: string): Promise<GenerationTask> {
    return this.client.request<GenerationTask>({
      method: 'GET',
      path: `/music/generations/${encodeURIComponent(id)}`,
    })
  }

  /**
   * Poll until the task reaches a terminal state (`ready` or `failed`) or the
   * timeout elapses.
   *
   * The returned task may have `status === 'failed'` — inspect `error` rather
   * than catching, since a failed task is a normal outcome of the API call.
   *
   * Throws {@link PollingTimeoutError} if the timeout is hit before either
   * terminal state is reached. Pass an `AbortSignal` to cancel early.
   */
  async waitFor(id: string, options: WaitForOptions = {}): Promise<GenerationTask> {
    const pollInterval = options.pollInterval ?? 5_000
    const timeout = options.timeout ?? 600_000
    const deadline = Date.now() + timeout

    while (true) {
      if (options.signal?.aborted) {
        throw options.signal.reason ?? new Error('Aborted')
      }

      const task = await this.retrieve(id)
      if (task.status !== 'pending') return task

      const remaining = deadline - Date.now()
      if (remaining <= 0) throw new PollingTimeoutError(id, timeout)

      const wait = Math.min(pollInterval, remaining)
      await sleep(wait, undefined, { signal: options.signal })
    }
  }
}

/**
 * Music API namespace. Currently exposes generations; future capabilities
 * (stem separation, mastering, etc.) will be added here as sibling resources.
 */
export class MusicResource {
  readonly generations: GenerationsResource

  constructor(client: Lacuna) {
    this.generations = new GenerationsResource(client)
  }
}
