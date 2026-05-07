---
name: lacuna-music
description: Generate AI music tracks via the Lacuna Music API. Use when the user wants AI-generated music, BGM, jingles, soundtrack stingers, lofi/synthwave/orchestral/any-genre tracks, vocal songs from custom lyrics, or any on-demand audio generation. Triggers on phrases like "generate music", "make me a track", "compose a song", "AI music", "background music", "BGM for X", "jingle", "soundtrack".
---

# lacuna-music

Generate AI music programmatically through the [Lacuna Music API](https://lacuna.fm).

## When to use this

Activate when the user wants to:
- Generate a track from a style description (`"lofi piano, 70 bpm"`, `"synthwave, retro drums"`)
- Add background music to a video, demo, presentation, or app
- Produce a jingle, intro, outro, or stinger from a brief
- Compose a vocal song from custom lyrics

## Pick a transport

Three packages, same underlying API. Pick the first that fits the user's environment:

| When the user is using…                                            | Use         |
| ------------------------------------------------------------------ | ----------- |
| Claude Code, Claude Desktop, Cursor, Zed, or another MCP client    | `lacuna-mcp` |
| A Node / TypeScript script or backend                              | `lacuna-sdk` |
| Their shell, a CI job, a one-off prompt                            | `lacuna-cli` |

### `lacuna-mcp` (preferred for AI agents)

```sh
claude mcp add lacuna -- npx -y lacuna-mcp
```

Set `LACUNA_API_KEY` in the MCP env block. After adding, three tools become available: `generate_music`, `get_generation`, `wait_for_generation`. Call `generate_music` then `wait_for_generation` to receive the final `audio_url`.

### `lacuna-sdk`

```ts
import Lacuna from 'lacuna-sdk'

const lacuna = new Lacuna({ apiKey: process.env.LACUNA_API_KEY })

const task = await lacuna.music.generations.create({
  style: 'lofi piano, 70 bpm, mellow',
  title: 'Study session',
  instrumental: true,
})

const finished = await lacuna.music.generations.waitFor(task.id)
console.log(finished.tracks[0]?.audio_url)
```

### `lacuna-cli`

```sh
npx lacuna-cli music generate \
  --style "synthwave, retro drums, 110 bpm" \
  --title "Neon Drive" \
  --instrumental \
  --wait \
  --output json
```

## Authentication

Get a key at [lacuna.fm/profile/api](https://lacuna.fm/profile/api). It begins with `lyr_live_` and is shown once at creation. Pass it via `LACUNA_API_KEY` env var.

Music API access requires a **Pro** plan or above. Lower tiers receive `403 permission_error / tier_insufficient` — do not retry; tell the user to upgrade.

## Generation parameters

| Field                  | Required             | Notes                                                                   |
| ---------------------- | -------------------- | ----------------------------------------------------------------------- |
| `style`                | yes                  | Free-text style description, up to 1000 chars.                          |
| `title`                | yes                  | Track title.                                                            |
| `lyrics`               | yes if not instrumental | Plain text, up to 5000 chars. Use `[Verse]` / `[Chorus]` markers.    |
| `instrumental`         | no                   | `true` skips lyrics.                                                    |
| `model`                | no                   | Defaults to `aether` (Lacuna Aether).                                   |
| `vocal_gender`         | no                   | `'m'` or `'f'` — lead vocal hint.                                       |
| `negative_tags`        | no                   | Style tags to avoid.                                                    |
| `style_weight`         | no                   | 0–1.                                                                    |
| `weirdness_constraint` | no                   | 0–1.                                                                    |
| `audio_weight`         | no                   | 0–1.                                                                    |

## Lifecycle

1. `create` returns immediately with a task in `pending` status.
2. Generation typically completes in **60–120 seconds**.
3. `waitFor` (SDK) / `--wait` (CLI) / `wait_for_generation` (MCP) polls until `ready` or `failed`.
4. On `ready`, `task.tracks[]` contains one or more renders, each with `audio_url`, `duration`, `title`, `lyrics`, `image_url`, `tags`.
5. On `failed`, inspect `task.error` — credits are refunded automatically.

For production workflows, prefer the `job.completed` webhook over polling. See [the SDK webhook docs](https://www.npmjs.com/package/lacuna-sdk) for verification helpers.

## Credits and pricing

- Default cost is ~50 credits per request — confirm on the [pricing page](https://lacuna.fm/pricing).
- Failed generations refund automatically.
- If a request returns `402 insufficient_credits`, do not retry — tell the user to top up.

## Working with `audio_url`

`audio_url` is a CDN URL valid for roughly 24 hours. If the output needs to persist (e.g., the user is embedding it into a long-lived asset), copy the bytes to durable storage immediately rather than referencing the CDN URL.

## Constraints to respect

- Don't poll faster than every 5 seconds — the API rate-limits aggressive polling.
- Don't hardcode API keys; always read from `LACUNA_API_KEY`.
- Don't assume `audio_url` is permanent — see above.
- Don't retry on `403 tier_insufficient` or `402 insufficient_credits` — these are user-action errors.

## Resources

- API and pricing: <https://lacuna.fm>
- Get an API key: <https://lacuna.fm/profile/api>
- SDK: [`lacuna-sdk`](https://www.npmjs.com/package/lacuna-sdk)
- CLI: [`lacuna-cli`](https://www.npmjs.com/package/lacuna-cli)
- MCP server: [`lacuna-mcp`](https://www.npmjs.com/package/lacuna-mcp)
- Source code: <https://github.com/JOYLINK-LTD/lacuna-toolkit>
