# lacuna-mcp

[![npm version](https://img.shields.io/npm/v/lacuna-mcp.svg)](https://www.npmjs.com/package/lacuna-mcp)
[![License: MIT](https://img.shields.io/npm/l/lacuna-mcp.svg)](./LICENSE)
[![Node.js](https://img.shields.io/node/v/lacuna-mcp.svg)](https://nodejs.org)

[Model Context Protocol](https://modelcontextprotocol.io) server for the [Lacuna Music API](https://lacuna.fm). Lets MCP-compatible clients (Claude Desktop, Claude Code, Cursor, Zed, Continue, etc.) generate AI music as part of an agent loop.

> Looking for the SDK or CLI? See [`lacuna-sdk`](../sdk) and [`lacuna-toolkit`](../cli).

---

## Installation

The server is published as a single npm package and runs over stdio. No install step is needed — your MCP client launches it via `npx`.

```sh
npx lacuna-mcp
```

## Configuration

The server reads its configuration from environment variables:

| Variable           | Required | Description                                                                 |
| ------------------ | -------- | --------------------------------------------------------------------------- |
| `LACUNA_API_KEY`   | yes      | API key from [your profile dashboard](https://lacuna.fm/profile/api). Begins with `lyr_live_`. |
| `LACUNA_BASE_URL`  | no       | Override the API base URL (e.g. for staging).                               |

Music API access requires the **Pro** plan or above.

### Claude Desktop

Add an entry to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "lacuna": {
      "command": "npx",
      "args": ["-y", "lacuna-mcp"],
      "env": {
        "LACUNA_API_KEY": "lyr_live_..."
      }
    }
  }
}
```

The config file lives at:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

### Claude Code

```sh
claude mcp add lacuna -- npx -y lacuna-mcp
```

Then export the key in your shell or set it via your client's MCP settings.

### Cursor / Zed / other MCP clients

Any client that speaks the Model Context Protocol over stdio can run `npx -y lacuna-mcp` as the command and pass `LACUNA_API_KEY` as an env var. Refer to your client's MCP setup docs for the exact JSON shape.

---

## Tools

| Tool                      | Description                                                                                          |
| ------------------------- | ---------------------------------------------------------------------------------------------------- |
| `generate_music`          | Create a music generation task. Returns a `pending` task immediately.                                |
| `get_generation`          | Retrieve the current state of a generation task by id.                                               |
| `wait_for_generation`     | Poll a task until it reaches a terminal state (`ready` or `failed`) or the timeout elapses.          |

### `generate_music`

| Parameter              | Type                                | Description                                                          |
| ---------------------- | ----------------------------------- | -------------------------------------------------------------------- |
| `style`                | `string` *(required)*               | Style description, e.g. `"pop, female vocal, 120 bpm, energetic"`.   |
| `title`                | `string` *(required)*               | Track title.                                                         |
| `lyrics`               | `string`                            | Required unless `instrumental` is `true`.                            |
| `instrumental`         | `boolean`                           | Generate an instrumental track. Default `false`.                     |
| `model`                | `"aether"`                          | Generation model. Defaults to `aether` (Lacuna Aether).              |
| `vocal_gender`         | `"m" \| "f"`                        | Lead vocal hint.                                                     |
| `negative_tags`        | `string`                            | Style tags to avoid.                                                 |
| `style_weight`         | `number` (0–1)                      |                                                                      |
| `weirdness_constraint` | `number` (0–1)                      |                                                                      |
| `audio_weight`         | `number` (0–1)                      |                                                                      |

Credits are deducted on creation and refunded automatically if the upstream provider fails.

### `get_generation`

| Parameter | Type     | Description                                            |
| --------- | -------- | ------------------------------------------------------ |
| `id`      | `string` | Generation task id, returned by `generate_music`.      |

### `wait_for_generation`

| Parameter               | Type     | Description                                          |
| ----------------------- | -------- | ---------------------------------------------------- |
| `id`                    | `string` | Generation task id.                                  |
| `poll_interval_seconds` | `number` | Polling interval. Default 5.                         |
| `timeout_seconds`       | `number` | Total timeout. Default 600 (10 minutes).             |

---

## Requirements

- Node.js **18 or newer**.
- An API key from a Lacuna **Pro** plan or above.

---

## License

[MIT](../../LICENSE) © Louis Tsang
