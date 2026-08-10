# Lacuna Music

Generate original music inside a Dify workflow or agent — background beds for video and podcast,
loops and stingers for games and ads, or full vocal songs from lyrics you supply. Every tool returns
hosted MP3 URLs, so the next node can publish, mix or attach the audio without any file handling.

- **Website:** <https://www.lacuna.fm>
- **API reference:** <https://www.lacuna.fm/docs/api>
- **Source repository:** <https://github.com/JOYLINK-LTD/lacuna-toolkit>

## Setup

1. Sign in at [lacuna.fm](https://www.lacuna.fm) and open the
   [API keys page](https://www.lacuna.fm/profile/api).
2. Create a key. It is shown once and begins with `lyr_live_`.
3. Install this plugin in Dify, open its settings and paste the key into **Lacuna API Key**.

The Music API is available on the Pro plan and above; see [plans and credits](https://www.lacuna.fm/pricing).
The plugin validates the key against the API when you save it, so a wrong key or an ineligible plan
fails immediately rather than at the first generation.

**Connection requirements:** outbound HTTPS to `www.lacuna.fm` only. Audio is served from
`cdn.lacuna.fm`; the plugin passes those URLs through and never downloads them itself.

## Tools

### Generate music

Submits a generation and blocks until the audio is ready, then returns the track URLs. This is the
one to use in a linear workflow.

| Parameter | Required | Notes |
| --- | --- | --- |
| `style` | yes | Genre, instrumentation, mood and tempo, e.g. `lofi hip hop, mellow piano, 70 bpm, rainy`. |
| `title` | yes | Short name for the track. |
| `instrumental` | no | Defaults to on — music with no vocals. |
| `lyrics` | when `instrumental` is off | Section tags such as `[Verse]` and `[Chorus]` are supported. |
| `model` | no | `aether` (default) or `echo`. |
| `vocal_gender` | no | `f` or `m`. Aether only. |
| `negative_tags` | no | Styles to steer away from. Aether only. |
| `timeout_seconds` | no | 60–900, defaults to 420. |

Outputs: `task_id`, `credits_used`, `audio_url` (first track), `audio_urls` (all tracks), plus the
full task object as JSON.

### Create generation (async)

Queues the same request and returns the task id immediately, without waiting. Use it when the
workflow should not block for several minutes.

### Get generation

Looks up a task by id and reports `pending`, `ready` or `failed`, with the audio URLs once ready.
This call is free and consumes no credits.

## Models

| Model | Takes per request | Notes |
| --- | --- | --- |
| `aether` | 2 | Widest style range. The only model that accepts `vocal_gender` and `negative_tags`. Vocals work well in English, Chinese, Spanish, Portuguese, French, Japanese and Korean. |
| `echo` | 1 | One complete song structure of up to three minutes. Vocals work well in English, German, Spanish, French, Hindi, Japanese, Korean and Portuguese. |

Credit cost differs per model — the current rates are on the [pricing page](https://www.lacuna.fm/pricing).

## Example: soundtrack bed for a video script

```
LLM node        →  writes a one-line style brief from the script
Lacuna Music    →  generate_music(style = {{brief}}, title = {{slug}}, instrumental = true)
HTTP node       →  posts {{audio_url}} to your editor / CMS
```

## Billing and failures

Credits are deducted when the task is queued and refunded automatically if the generation fails, so a
failed task costs nothing. The `Get generation` response reports `credits_used` and `credits_refunded`
for every task. Rate limits are 60 requests per minute per key, with a concurrency cap that depends on
your plan; both return HTTP 429 with a `Retry-After` header.

If a `Generate music` call times out, the task is **not** cancelled — it keeps running on Lacuna. Take
the `task_id` from the error path or from `Create generation` and read it back later with
`Get generation`.

## Support

Open an issue at <https://github.com/JOYLINK-LTD/lacuna-toolkit/issues>.

## License

MIT.
