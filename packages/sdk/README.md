# lacuna-sdk

[![npm version](https://img.shields.io/npm/v/lacuna-sdk.svg)](https://www.npmjs.com/package/lacuna-sdk)
[![License: MIT](https://img.shields.io/npm/l/lacuna-sdk.svg)](./LICENSE)
[![Node.js](https://img.shields.io/node/v/lacuna-sdk.svg)](https://nodejs.org)

Official TypeScript SDK for the [Lacuna Music API](https://lacuna.fm). Generate AI music programmatically, await results, and verify webhooks from any Node 18+ runtime.

- Fully typed against the published OpenAPI spec
- Works in Node, Bun, and Deno (via npm)
- Webhook signature verification with constant-time comparison
- Automatic retries with `Retry-After` honoring and exponential backoff
- Polling helper that waits for terminal task state

> Looking for the command-line tool? See [`lacuna-cli`](../cli). For the MCP server, see [`lacuna-mcp`](../mcp).

---

## Table of contents

- [Installation](#installation)
- [Quickstart](#quickstart)
- [Authentication](#authentication)
- [SDK reference](#sdk-reference)
  - [Creating a generation](#creating-a-generation)
  - [Retrieving a generation](#retrieving-a-generation)
  - [Waiting for completion](#waiting-for-completion)
  - [Client options](#client-options)
- [Webhooks](#webhooks)
- [Errors](#errors)
- [Requirements](#requirements)
- [License](#license)

---

## Installation

```sh
npm install lacuna-sdk
# or
pnpm add lacuna-sdk
# or
yarn add lacuna-sdk
```

## Quickstart

```ts
import Lacuna from 'lacuna-sdk'

const lacuna = new Lacuna({ apiKey: process.env.LACUNA_API_KEY })

const task = await lacuna.music.generations.create({
  style: 'lofi hip hop, mellow piano, 70 bpm',
  title: 'Late Night Study',
  instrumental: true,
})

const finished = await lacuna.music.generations.waitFor(task.id)
console.log(finished.tracks[0]?.audio_url)
```

## Authentication

Generate an API key from your [Lacuna profile dashboard](https://lacuna.fm/profile/api). Keys begin with `lyr_live_` and are shown once at creation — store them in a secrets manager.

The SDK reads the key from one of two sources, in order:

1. The `apiKey` option passed to `new Lacuna({ apiKey })`.
2. The `LACUNA_API_KEY` environment variable.

```ts
const lacuna = new Lacuna({ apiKey: process.env.LACUNA_API_KEY })
```

Music API access requires the **Pro** plan or above. Requests from lower tiers receive `403 permission_error / tier_insufficient`.

---

## SDK reference

### Creating a generation

```ts
const task = await lacuna.music.generations.create({
  lyrics: '[Verse]\nSunlight on the water\n[Chorus]\nLet it shine',
  style: 'indie folk, female vocal, 90 bpm, warm',
  title: 'Sunlight',
  model: 'aether',
})

task.id      // 'cm123abc...'
task.status  // 'pending'
```

| Field                  | Type                       | Notes                                                            |
| ---------------------- | -------------------------- | ---------------------------------------------------------------- |
| `style`                | `string` *(required)*      | Up to 1000 chars.                                                |
| `title`                | `string` *(required)*      | Up to 200 chars.                                                 |
| `lyrics`               | `string`                   | Required unless `instrumental: true`. Up to 5000 chars.          |
| `instrumental`         | `boolean`                  | Default `false`.                                                 |
| `model`                | `'aether'`                 | Default `aether` (Lacuna Aether).                                |
| `vocal_gender`         | `'m' \| 'f'`               | Lead vocal hint.                                                 |
| `negative_tags`        | `string`                   | Style tags to avoid.                                             |
| `style_weight`         | `number` (0–1)             |                                                                  |
| `weirdness_constraint` | `number` (0–1)             |                                                                  |
| `audio_weight`         | `number` (0–1)             |                                                                  |

Credits are deducted on this call and refunded automatically if the upstream provider fails. The default cost is 50 credits per request — see [pricing](https://lacuna.fm/pricing).

### Retrieving a generation

```ts
const task = await lacuna.music.generations.retrieve('cm123abc')

if (task.status === 'ready') {
  for (const track of task.tracks) {
    console.log(track.audio_url, track.duration, track.lyrics)
  }
}
```

`status` is one of `'pending' | 'ready' | 'failed'`. A `failed` task is a normal outcome — inspect `task.error` for the reason; credits are refunded automatically.

### Waiting for completion

```ts
const task = await lacuna.music.generations.waitFor('cm123abc', {
  pollInterval: 5_000, // ms — default 5_000
  timeout: 600_000,    // ms — default 600_000 (10 minutes)
})
```

Throws `PollingTimeoutError` when the timeout elapses before the task finishes. Pass an `AbortSignal` to cancel early:

```ts
const controller = new AbortController()
setTimeout(() => controller.abort(), 30_000)

await lacuna.music.generations.waitFor(task.id, { signal: controller.signal })
```

For long-running production workflows prefer the `job.completed` webhook over polling.

### Client options

```ts
const lacuna = new Lacuna({
  apiKey: process.env.LACUNA_API_KEY,
  baseURL: 'https://lacuna.fm/api/v1', // override for staging
  timeout: 60_000,                     // ms per request, default 60_000
  maxRetries: 2,                       // retries on 429/5xx (except `model_unavailable`), default 2
  defaultHeaders: { 'X-App-Name': 'my-pipeline' },
  fetch: customFetch,                  // custom fetch impl (proxy, instrumentation)
})
```

Retries use the server's `Retry-After` header when present, falling back to jittered exponential backoff (`500ms × 2^attempt`).

---

## Webhooks

Lacuna emits four event types: `job.completed`, `job.failed`, `credits.low`, `key.expiring`. Each request carries an `X-Lacuna-Signature` header in the form `t=<unix>,v1=<hex>`, where the hex is `HMAC-SHA256(secret, "${t}.${rawBody}")`.

`constructEvent` verifies the signature and parses the body in one call. **Pass the raw body** — once the body is parsed, the signature can no longer be verified.

### Express

```ts
import express from 'express'
import { Webhooks } from 'lacuna-sdk/webhooks'

const app = express()

app.post(
  '/webhooks/lacuna',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    try {
      const event = Webhooks.constructEvent(
        req.body,                                  // Buffer (raw body)
        req.headers['x-lacuna-signature'],
        process.env.LACUNA_WEBHOOK_SECRET!,
      )

      if (Webhooks.isJobCompleted(event)) {
        console.log('Tracks ready:', event.data.tracks)
      } else if (Webhooks.isJobFailed(event)) {
        console.error('Generation failed:', event.data.error)
      }

      res.status(200).end()
    } catch (err) {
      console.error('Invalid webhook signature:', err)
      res.status(400).end()
    }
  },
)
```

### Next.js (App Router)

```ts
// app/api/webhooks/lacuna/route.ts
import { Webhooks } from 'lacuna-sdk/webhooks'

export async function POST(request: Request) {
  const rawBody = await request.text()
  try {
    const event = Webhooks.constructEvent(
      rawBody,
      request.headers.get('x-lacuna-signature'),
      process.env.LACUNA_WEBHOOK_SECRET!,
    )

    if (event.type === 'job.completed') {
      // event.data is fully typed
    }

    return new Response(null, { status: 200 })
  } catch {
    return new Response(null, { status: 400 })
  }
}
```

### Available helpers

```ts
import { Webhooks } from 'lacuna-sdk/webhooks'

Webhooks.constructEvent(payload, header, secret, options?) // verify + parse
Webhooks.verifySignature(payload, header, secret, options?) // boolean
Webhooks.isJobCompleted(event)
Webhooks.isJobFailed(event)
Webhooks.isCreditsLow(event)
Webhooks.isKeyExpiring(event)
Webhooks.SignatureError                                    // thrown by constructEvent
Webhooks.HEADER                                            // 'x-lacuna-signature'
```

The default replay window is 5 minutes; tune via `{ toleranceSeconds }`.

---

## Errors

Every error thrown by the SDK extends `LacunaError`. Catch the base class for a single net, or narrow on subclasses for granular handling.

```ts
import {
  Lacuna,
  APIError,
  AuthenticationError,
  InsufficientCreditsError,
  ModelUnavailableError,
  PermissionError,
  RateLimitError,
  PollingTimeoutError,
  APITimeoutError,
  APIConnectionError,
} from 'lacuna-sdk'

try {
  await lacuna.music.generations.create(params)
} catch (err) {
  if (err instanceof RateLimitError) {
    console.log(`Backing off for ${err.retryAfter}s`)
  } else if (err instanceof ModelUnavailableError) {
    // The requested model is circuit-broken. The SDK won't auto-fallback —
    // each model has a different credit cost. Pick another one yourself.
    console.log(
      `Model ${err.model} is down for ~${err.retryAfterSeconds}s; retrying with a different model`
    )
  } else if (err instanceof InsufficientCreditsError) {
    // top up or pause the worker
  } else if (err instanceof APIError) {
    console.error(`HTTP ${err.status} ${err.code}: ${err.message}`)
  }
}
```

| Class                       | When it's thrown                                                                                |
| --------------------------- | ----------------------------------------------------------------------------------------------- |
| `BadRequestError`           | `400` — invalid request body or parameters (`err.param` indicates which).                       |
| `AuthenticationError`       | `401` — missing, invalid, expired, or revoked API key.                                          |
| `InsufficientCreditsError`  | `402` — credit balance too low.                                                                 |
| `PermissionError`           | `403` — tier not high enough for the Music API.                                                 |
| `NotFoundError`             | `404` — task does not exist or is not owned by this key.                                        |
| `RateLimitError`            | `429` — RPM or concurrent-request cap exceeded. Inspect `err.retryAfter`.                       |
| `ServiceUnavailableError`   | `503` — server is temporarily unavailable. Inspect `err.retryAfter`.                            |
| `ModelUnavailableError`     | `503` `model_unavailable` — the requested model is circuit-broken. Inspect `err.model` and `err.retryAfterSeconds`; the SDK does **not** auto-fallback (different models have different credit costs). |
| `InternalServerError`       | `5xx` — server or upstream provider failure (other than `503`).                                 |
| `APIError`                  | Base class for any non-2xx response.                                                            |
| `APIConnectionError`        | Network failure (DNS, TCP reset, fetch threw).                                                  |
| `APITimeoutError`           | Request exceeded `timeout` option.                                                              |
| `PollingTimeoutError`       | `waitFor` exceeded its `timeout` option.                                                        |
| `WebhookSignatureError`     | `constructEvent` rejected a request (exported from `lacuna-sdk/webhooks`).                      |

`APIError` exposes `status`, `type`, `code`, `param`, and lower-cased `headers` so you can build retry, logging, or alerting logic without parsing strings.

---

## Requirements

- Node.js **18 or newer** (uses the global `fetch` and `AbortController`).
- An API key from a Lacuna **Pro** plan or above.

---

## License

[MIT](../../LICENSE) © Louis Tsang
