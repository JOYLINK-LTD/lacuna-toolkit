# Lacuna developer tools

[![License: MIT](https://img.shields.io/npm/l/lacuna-cli.svg)](./LICENSE)

Open-source SDK, CLI, MCP server, and Agent Skill for the [Lacuna Music API](https://lacuna.fm). Generate AI music programmatically from any Node 18+ runtime, your shell, an MCP-compatible client, or an AI coding agent that supports the [Agent Skills](https://agentskills.io) standard.

| Surface | Install | Use case |
| --- | --- | --- |
| [`lacuna-sdk`](./packages/sdk) | `npm install lacuna-sdk` | TypeScript / JavaScript SDK with webhook verification. |
| [`lacuna-cli`](./packages/cli) | `npx lacuna-cli` | Command-line interface for one-off generation, scripting, CI. |
| [`lacuna-mcp`](./packages/mcp) | `npx lacuna-mcp` | Model Context Protocol server for Claude Desktop, Claude Code, Cursor, etc. |
| [`lacuna-music` skill](./skills/lacuna-music) | `npx skills add JOYLINK-LTD/lacuna-toolkit` | Agent Skill for Claude Code, Codex CLI, Cursor, and other tools that follow the [SKILL.md](https://agentskills.io) standard. |

The three npm packages are released together and share the same API surface. The skill is markdown-only and tracks the latest published packages.

---

## Repository layout

```
.
├── packages/
│   ├── sdk/                   →  npm: lacuna-sdk
│   ├── cli/                   →  npm: lacuna-cli
│   └── mcp/                   →  npm: lacuna-mcp
├── skills/
│   └── lacuna-music/SKILL.md  →  Agent Skill (skills.sh, skillsmp.com, etc.)
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── package.json
```

This is a [pnpm](https://pnpm.io) workspace. The CLI and MCP server depend on the SDK via `workspace:*`, which is rewritten to a real version range on publish. The skill is plain markdown and is not part of the workspace.

## Development

```sh
pnpm install            # install all workspace deps
pnpm -r run build       # build every package
pnpm -r run typecheck   # typecheck every package
pnpm --filter lacuna-mcp run dev  # iterate on a single package
```

The SDK must be built before `pnpm -r run typecheck` can resolve the CLI/MCP packages' types. `pnpm -r run build` handles dependency order automatically.

## Releasing

Each package versions independently from `packages/<pkg>/package.json`. Bump versions in lockstep, build, then publish:

```sh
# bump 0.2.0 → 0.2.1 in all three package.jsons (and packages/sdk/src/version.ts)
pnpm -r run build
pnpm --filter lacuna-sdk publish --access public
pnpm --filter lacuna-cli publish --access public
pnpm --filter lacuna-mcp publish --access public
```

`workspace:*` references in `dependencies` are rewritten to the published version automatically (pnpm handles this).

## Distributing the skill

The skill at [`skills/lacuna-music/`](./skills/lacuna-music) follows the [Agent Skills](https://agentskills.io) open standard, so it works with Claude Code, Codex CLI, Cursor, and any other tool that loads `SKILL.md` files.

There is **no submission step** for skill marketplaces — they index public GitHub repos automatically:

- **[skills.sh](https://skills.sh)** (Vercel Labs) ranks skills by anonymous install telemetry. Once the repo is public, anyone can install with `npx skills add JOYLINK-LTD/lacuna-toolkit`, and installs feed the leaderboard. The CLI auto-discovers `SKILL.md` files under `skills/<name>/`.
- **[skillsmp.com](https://skillsmp.com)** and **[claudeskills.info](https://claudeskills.info)** crawl public GitHub repos that contain `SKILL.md` and a minimum of 2 stars.
- The official **[anthropics/skills](https://github.com/anthropics/skills)** repo accepts community-contributed skills via PR if you want a canonical listing.

To verify discovery locally:

```sh
npx skills add JOYLINK-LTD/lacuna-toolkit
```

This installs `lacuna-music` into `~/.claude/skills/lacuna-music/` (and the equivalent for other agents). Edits to `skills/lacuna-music/SKILL.md` show up on the next `skills add`.

## License

[MIT](./LICENSE) © Louis Tsang
