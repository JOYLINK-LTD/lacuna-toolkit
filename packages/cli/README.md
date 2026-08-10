# lacuna-toolkit

[![npm version](https://img.shields.io/npm/v/lacuna-toolkit.svg)](https://www.npmjs.com/package/lacuna-toolkit)
[![License: MIT](https://img.shields.io/npm/l/lacuna-toolkit.svg)](./LICENSE)
[![Node.js](https://img.shields.io/node/v/lacuna-toolkit.svg)](https://nodejs.org)

Official command-line interface for the [Lacuna Music API](https://www.lacuna.fm). Generate AI music from a shell — for one-off prompts, scripting, or CI.

> For programmatic use from TypeScript or JavaScript, install [`lacuna-sdk`](../sdk) instead. For an MCP server, see [`lacuna-mcp`](../mcp).

---

## Installation

Use without installing:

```sh
npx lacuna-toolkit --help
```

Or install globally:

```sh
npm install -g lacuna-toolkit
# or
pnpm add -g lacuna-toolkit
```

The CLI is invoked as `lacuna`.

```sh
lacuna --help
lacuna --version
```

## Authentication

Generate an API key from your [Lacuna profile dashboard](https://www.lacuna.fm/profile/api). Keys begin with `lyr_live_` and are shown once at creation — store them in a secrets manager.

The CLI reads the key from one of three sources, in order:

1. The `--api-key` flag.
2. The `LACUNA_API_KEY` environment variable.
3. The saved config at `~/.lacuna/config.json` (mode `0600`).

```sh
lacuna config set-key lyr_live_xxxxxxxx__xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
lacuna config set-base-url https://staging.lacuna.fm/api/v1
lacuna config show       # API key is masked
lacuna config clear
```

Music API access requires the **Pro** plan or above. Requests from lower tiers receive `403 permission_error / tier_insufficient`.

Verify a key without spending credits:

```sh
lacuna whoami
```

---

## Commands

### Check the account

```sh
lacuna whoami
lacuna whoami --output json
```

Prints the account id, plan, credit balance, rate limits and the key's scopes. Free — consumes no credits.

### Generate a track

```sh
lacuna music generate \
  --style "synthwave, retro drums, 110 bpm" \
  --title "Neon Drive" \
  --lyrics "[Verse]\nNeon lights..." \
  --model aether \
  --wait
```

| Flag                       | Description                                                    |
| -------------------------- | -------------------------------------------------------------- |
| `--style <text>`           | Required. Style description.                                   |
| `--title <text>`           | Required. Track title.                                         |
| `--lyrics <text>`          | Inline lyrics.                                                 |
| `--lyrics-file <path>`     | Read lyrics from a UTF-8 file.                                 |
| `--instrumental`           | Generate an instrumental track.                                |
| `--model <aether\|echo>`   | Generation model. Defaults to `aether`.                        |
| `--vocal-gender <m\|f>`    | Lead vocal hint (`aether` only).                               |
| `--negative-tags <text>`   | Style tags to avoid (`aether` only).                           |
| `--style-weight <0-1>`     | `aether` only.                                                 |
| `--weirdness-constraint`   | `aether` only.                                                 |
| `--audio-weight <0-1>`     | `aether` only.                                                 |
| `--wait`                   | Poll until the task reaches a terminal state.                  |
| `--poll-interval <secs>`   | Polling interval (with `--wait`). Default 5.                   |
| `--timeout <secs>`         | Polling timeout (with `--wait`). Default 600.                  |
| `--output <json\|table>`   | Output format. Default `table`.                                |

The process exits with code `2` if `--wait` is set and the task ends in `failed` state.

### Retrieve and wait

```sh
lacuna music get <task_id> --output json
lacuna music wait <task_id> --timeout 900
```

### Output formats

`--output table` (default) renders a human-friendly summary. `--output json` prints the raw API response — feed it to `jq` or store it in CI artifacts.

```sh
lacuna music get cm123abc --output json | jq '.tracks[].audio_url'
```

---

## Requirements

- Node.js **18 or newer**.
- An API key from a Lacuna **Pro** plan or above.

---

## License

[MIT](../../LICENSE) © Louis Tsang
