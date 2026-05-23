#!/usr/bin/env node
/**
 * `lacuna` — command-line interface for the Lacuna Music API.
 *
 * Mirrors the SDK surface so the same primitives are usable from a shell:
 *
 * ```sh
 * lacuna config set-key lyr_live_...
 * lacuna music generate --title "Song" --style "pop" --lyrics "..." --wait
 * lacuna music get <task_id>
 * ```
 */

import { chmodSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import { Command, Option } from 'commander'

import { Lacuna, APIError, LacunaError, VERSION } from 'lacuna-sdk'
import type { CreateGenerationParams, GenerationTask, Model, VocalGender } from 'lacuna-sdk'

const CONFIG_DIR = join(homedir(), '.lacuna')
const CONFIG_PATH = join(CONFIG_DIR, 'config.json')

interface CliConfig {
  apiKey?: string
  baseURL?: string
}

interface GlobalOpts {
  apiKey?: string
  baseURL?: string
}

function loadConfig(): CliConfig {
  if (!existsSync(CONFIG_PATH)) return {}
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object') return parsed as CliConfig
    return {}
  } catch {
    return {}
  }
}

function saveConfig(config: CliConfig): void {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true, mode: 0o700 })
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8')
  try {
    chmodSync(CONFIG_PATH, 0o600)
  } catch {
    // Best-effort on platforms that don't support POSIX modes (Windows).
  }
}

function resolveClient(globalOpts: GlobalOpts): Lacuna {
  const config = loadConfig()
  const apiKey = globalOpts.apiKey ?? process.env.LACUNA_API_KEY ?? config.apiKey
  const baseURL = globalOpts.baseURL ?? process.env.LACUNA_BASE_URL ?? config.baseURL

  if (!apiKey) {
    fail(
      'No API key found. Set one with `lacuna config set-key <KEY>`, the `LACUNA_API_KEY` env var, or the `--api-key` flag.'
    )
  }

  const opts: ConstructorParameters<typeof Lacuna>[0] = { apiKey }
  if (baseURL) opts.baseURL = baseURL
  return new Lacuna(opts)
}

function maskKey(key: string): string {
  if (key.length <= 12) return key
  return `${key.slice(0, 12)}…${key.slice(-4)}`
}

function fail(message: string): never {
  process.stderr.write(`error: ${message}\n`)
  process.exit(1)
}

function printOutput(data: unknown, format: 'json' | 'table'): void {
  if (format === 'json') {
    process.stdout.write(`${JSON.stringify(data, null, 2)}\n`)
    return
  }
  if (isGenerationTask(data)) {
    printTaskTable(data)
    return
  }
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`)
}

function isGenerationTask(value: unknown): value is GenerationTask {
  return (
    !!value &&
    typeof value === 'object' &&
    'id' in value &&
    'status' in value &&
    'tracks' in value
  )
}

function printTaskTable(task: GenerationTask): void {
  const lines = [
    `Task    ${task.id}`,
    `Status  ${task.status}`,
    `Model   ${task.model ?? '-'}`,
    `Credits ${task.credits_used} used, ${task.credits_refunded} refunded`,
    `Created ${task.created_at}`,
    `Updated ${task.updated_at}`,
  ]
  if (task.error) lines.push(`Error   ${task.error.code}: ${task.error.message}`)
  process.stdout.write(`${lines.join('\n')}\n`)

  if (task.tracks.length === 0) {
    process.stdout.write('\nTracks  (none yet)\n')
    return
  }

  process.stdout.write('\nTracks\n')
  for (const track of task.tracks) {
    process.stdout.write(
      `  [${track.index}] ${track.title ?? 'Untitled'}` +
        (track.duration ? ` (${track.duration.toFixed(1)}s)` : '') +
        '\n'
    )
    process.stdout.write(`      ${track.audio_url}\n`)
  }
}

function attachGlobalFlags(cmd: Command): Command {
  return cmd
    .option('--api-key <key>', 'Override the API key for this command.')
    .option('--base-url <url>', 'Override the API base URL.')
}

function parseFloatOption(value: string): number {
  const parsed = Number.parseFloat(value)
  if (!Number.isFinite(parsed)) {
    fail(`Invalid number: ${value}`)
  }
  return parsed
}

function parseIntOption(value: string): number {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) {
    fail(`Invalid integer: ${value}`)
  }
  return parsed
}

const program = new Command()

program
  .name('lacuna')
  .description('Official CLI for the Lacuna Music API.')
  .version(VERSION, '-v, --version', 'Print the CLI version.')
  .showHelpAfterError()

// ---------------- config ----------------

const config = program.command('config').description('Manage CLI credentials and defaults.')

config
  .command('set-key <key>')
  .description('Store an API key at ~/.lacuna/config.json (mode 0600).')
  .action((key: string) => {
    const current = loadConfig()
    saveConfig({ ...current, apiKey: key })
    process.stdout.write(`Saved API key (${maskKey(key)}) to ${CONFIG_PATH}\n`)
  })

config
  .command('set-base-url <url>')
  .description('Override the API base URL (useful for staging environments).')
  .action((url: string) => {
    const current = loadConfig()
    saveConfig({ ...current, baseURL: url })
    process.stdout.write(`Saved base URL to ${CONFIG_PATH}\n`)
  })

config
  .command('show')
  .description('Print the current saved config (API key is masked).')
  .action(() => {
    const current = loadConfig()
    const printable = {
      apiKey: current.apiKey ? maskKey(current.apiKey) : null,
      baseURL: current.baseURL ?? null,
      configPath: CONFIG_PATH,
    }
    process.stdout.write(`${JSON.stringify(printable, null, 2)}\n`)
  })

config
  .command('clear')
  .description('Delete the saved config.')
  .action(() => {
    saveConfig({})
    process.stdout.write(`Cleared ${CONFIG_PATH}\n`)
  })

// ---------------- music ----------------

const music = program.command('music').description('Music generation endpoints.')

attachGlobalFlags(
  music
    .command('generate')
    .alias('create')
    .description('Create a music generation task.')
    .requiredOption('--style <text>', 'Style description, e.g. "pop, female vocal, 120 bpm".')
    .requiredOption('--title <text>', 'Track title.')
    .option('--lyrics <text>', 'Lyrics in plain text.')
    .option('--lyrics-file <path>', 'Read lyrics from a file (UTF-8).')
    .option('--instrumental', 'Generate an instrumental track (no lyrics).', false)
    .addOption(
      new Option(
        '--model <model>',
        'Generation model. Defaults to `aether`. Use `echo` for fast/short tracks, `nocturne` for premium vocals.'
      ).choices(['aether', 'echo', 'nocturne'])
    )
    .addOption(
      new Option('--vocal-gender <gender>', 'Lead vocal gender hint (aether only).').choices(['m', 'f'])
    )
    .option('--negative-tags <text>', 'Negative style tags to avoid (aether only).')
    .option('--style-weight <number>', 'Style weight 0–1 (aether only).', parseFloatOption)
    .option('--weirdness-constraint <number>', 'Weirdness constraint 0–1 (aether only).', parseFloatOption)
    .option('--audio-weight <number>', 'Audio reference weight 0–1 (aether only).', parseFloatOption)
    .option('--duration <seconds>', 'Target duration in seconds, 5–240 (echo only).', parseIntOption)
    .option('--wait', 'Poll until the task reaches a terminal state.', false)
    .option(
      '--poll-interval <seconds>',
      'Polling interval in seconds (with --wait).',
      parseIntOption,
      5
    )
    .option(
      '--timeout <seconds>',
      'Polling timeout in seconds (with --wait).',
      parseIntOption,
      600
    )
    .addOption(
      new Option('--output <format>', 'Output format.').choices(['json', 'table']).default('table')
    )
)
  .action(async (opts, cmd: Command) => {
    const globals = cmd.parent?.parent?.opts<GlobalOpts>() ?? {}
    const merged: GlobalOpts = { ...globals, ...opts }
    const client = resolveClient(merged)

    let lyrics: string | undefined = opts.lyrics
    if (opts.lyricsFile) {
      try {
        lyrics = readFileSync(opts.lyricsFile, 'utf8')
      } catch (err) {
        fail(`Failed to read lyrics file: ${(err as Error).message}`)
      }
    }
    if (!opts.instrumental && !lyrics?.trim()) {
      fail('Lyrics are required unless --instrumental is set.')
    }

    const params: CreateGenerationParams = {
      style: opts.style,
      title: opts.title,
      instrumental: Boolean(opts.instrumental),
    }
    if (lyrics !== undefined) params.lyrics = lyrics
    if (opts.model) params.model = opts.model as Model
    if (opts.vocalGender) params.vocal_gender = opts.vocalGender as VocalGender
    if (opts.negativeTags) params.negative_tags = opts.negativeTags
    if (opts.styleWeight !== undefined) params.style_weight = opts.styleWeight
    if (opts.weirdnessConstraint !== undefined) params.weirdness_constraint = opts.weirdnessConstraint
    if (opts.audioWeight !== undefined) params.audio_weight = opts.audioWeight
    if (opts.duration !== undefined) params.duration = opts.duration

    try {
      let task = await client.music.generations.create(params)
      if (opts.wait) {
        task = await client.music.generations.waitFor(task.id, {
          pollInterval: opts.pollInterval * 1000,
          timeout: opts.timeout * 1000,
        })
      }
      printOutput(task, opts.output)
      if (opts.wait && task.status === 'failed') process.exit(2)
    } catch (err) {
      handleError(err)
    }
  })

attachGlobalFlags(
  music
    .command('get <id>')
    .alias('retrieve')
    .description('Retrieve a generation task by id.')
    .addOption(
      new Option('--output <format>', 'Output format.').choices(['json', 'table']).default('table')
    )
)
  .action(async (id: string, opts, cmd: Command) => {
    const globals = cmd.parent?.parent?.opts<GlobalOpts>() ?? {}
    const merged: GlobalOpts = { ...globals, ...opts }
    const client = resolveClient(merged)
    try {
      const task = await client.music.generations.retrieve(id)
      printOutput(task, opts.output)
    } catch (err) {
      handleError(err)
    }
  })

attachGlobalFlags(
  music
    .command('wait <id>')
    .description('Poll a task until it reaches a terminal state.')
    .option('--poll-interval <seconds>', 'Polling interval in seconds.', parseIntOption, 5)
    .option('--timeout <seconds>', 'Polling timeout in seconds.', parseIntOption, 600)
    .addOption(
      new Option('--output <format>', 'Output format.').choices(['json', 'table']).default('table')
    )
)
  .action(async (id: string, opts, cmd: Command) => {
    const globals = cmd.parent?.parent?.opts<GlobalOpts>() ?? {}
    const merged: GlobalOpts = { ...globals, ...opts }
    const client = resolveClient(merged)
    try {
      const task = await client.music.generations.waitFor(id, {
        pollInterval: opts.pollInterval * 1000,
        timeout: opts.timeout * 1000,
      })
      printOutput(task, opts.output)
      if (task.status === 'failed') process.exit(2)
    } catch (err) {
      handleError(err)
    }
  })

function handleError(err: unknown): never {
  if (err instanceof APIError) {
    fail(`HTTP ${err.status} ${err.code}: ${err.message}`)
  }
  if (err instanceof LacunaError) {
    fail(err.message)
  }
  if (err instanceof Error) {
    fail(err.message)
  }
  fail(String(err))
}

program.parseAsync(process.argv).catch((err: unknown) => {
  handleError(err)
})
