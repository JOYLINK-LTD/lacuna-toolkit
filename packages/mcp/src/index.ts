#!/usr/bin/env node
/**
 * `lacuna-mcp` — Model Context Protocol server for the Lacuna Music API.
 *
 * Exposes the Lacuna SDK as MCP tools so MCP-compatible clients (Claude
 * Desktop, Claude Code, Cursor, etc.) can generate music programmatically.
 *
 * Connection is over stdio (the standard MCP transport).
 *
 * Configuration:
 *   - `LACUNA_API_KEY` (required) — API key from https://lacuna.fm/profile/api
 *   - `LACUNA_BASE_URL` (optional) — override the API base URL
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { Lacuna, APIError, LacunaError, VERSION } from 'lacuna-sdk'
import type { CreateGenerationParams, GenerationTask, Model, VocalGender } from 'lacuna-sdk'
import { z } from 'zod'

const apiKey = process.env.LACUNA_API_KEY
if (!apiKey) {
  process.stderr.write(
    'lacuna-mcp: LACUNA_API_KEY is not set. Configure it in your MCP client.\n'
  )
  process.exit(1)
}

const clientOptions: ConstructorParameters<typeof Lacuna>[0] = { apiKey }
if (process.env.LACUNA_BASE_URL) clientOptions.baseURL = process.env.LACUNA_BASE_URL
const lacuna = new Lacuna(clientOptions)

const server = new McpServer({
  name: 'lacuna-mcp',
  version: VERSION,
})

function formatTask(task: GenerationTask): string {
  return JSON.stringify(task, null, 2)
}

function toToolError(err: unknown): { content: Array<{ type: 'text'; text: string }>; isError: true } {
  let message: string
  if (err instanceof APIError) {
    message = `Lacuna API error: HTTP ${err.status} ${err.code}: ${err.message}`
  } else if (err instanceof LacunaError) {
    message = `Lacuna error: ${err.message}`
  } else if (err instanceof Error) {
    message = err.message
  } else {
    message = String(err)
  }
  return { content: [{ type: 'text', text: message }], isError: true }
}

server.registerTool(
  'generate_music',
  {
    title: 'Generate music',
    description:
      'Create an AI music generation task on Lacuna. Returns immediately with a `pending` task; use `wait_for_generation` or `get_generation` to retrieve the finished tracks.',
    inputSchema: {
      style: z
        .string()
        .describe('Style description, e.g. "pop, female vocal, 120 bpm, energetic".'),
      title: z.string().describe('Track title.'),
      lyrics: z
        .string()
        .optional()
        .describe('Lyrics in plain text. Required unless `instrumental` is true.'),
      instrumental: z
        .boolean()
        .optional()
        .describe('Generate an instrumental track (no lyrics). Defaults to false.'),
      model: z
        .enum(['aether', 'echo', 'nocturne'])
        .optional()
        .describe(
          'Generation model. Defaults to `aether`. `echo` = fast, duration-controlled (5–240s). `nocturne` = premium vocal/emotion.'
        ),
      vocal_gender: z.enum(['m', 'f']).optional().describe('Lead vocal gender hint (aether only).'),
      negative_tags: z.string().optional().describe('Negative style tags to avoid (aether only).'),
      style_weight: z.number().min(0).max(1).optional().describe('Style weight 0–1 (aether only).'),
      weirdness_constraint: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe('Weirdness constraint 0–1 (aether only).'),
      audio_weight: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe('Audio reference weight 0–1 (aether only).'),
      duration: z
        .number()
        .min(5)
        .max(240)
        .optional()
        .describe('Target track duration in seconds, 5–240 (echo only).'),
    },
  },
  async (args) => {
    try {
      const params: CreateGenerationParams = {
        style: args.style,
        title: args.title,
        instrumental: args.instrumental ?? false,
      }
      if (args.lyrics !== undefined) params.lyrics = args.lyrics
      if (args.model) params.model = args.model as Model
      if (args.vocal_gender) params.vocal_gender = args.vocal_gender as VocalGender
      if (args.negative_tags) params.negative_tags = args.negative_tags
      if (args.style_weight !== undefined) params.style_weight = args.style_weight
      if (args.weirdness_constraint !== undefined)
        params.weirdness_constraint = args.weirdness_constraint
      if (args.audio_weight !== undefined) params.audio_weight = args.audio_weight
      if (args.duration !== undefined) params.duration = args.duration

      const task = await lacuna.music.generations.create(params)
      return { content: [{ type: 'text', text: formatTask(task) }] }
    } catch (err) {
      return toToolError(err)
    }
  }
)

server.registerTool(
  'get_generation',
  {
    title: 'Get generation',
    description: 'Retrieve the current state of a music generation task by id.',
    inputSchema: {
      id: z.string().describe('Generation task id (e.g. "gen_..."), returned by generate_music.'),
    },
  },
  async ({ id }) => {
    try {
      const task = await lacuna.music.generations.retrieve(id)
      return { content: [{ type: 'text', text: formatTask(task) }] }
    } catch (err) {
      return toToolError(err)
    }
  }
)

server.registerTool(
  'wait_for_generation',
  {
    title: 'Wait for generation',
    description:
      'Poll a generation task until it reaches a terminal state (`ready` or `failed`) or the timeout elapses. Returns the final task object including audio URLs on success.',
    inputSchema: {
      id: z.string().describe('Generation task id.'),
      poll_interval_seconds: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Polling interval in seconds. Defaults to 5.'),
      timeout_seconds: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Total timeout in seconds. Defaults to 600 (10 minutes).'),
    },
  },
  async ({ id, poll_interval_seconds, timeout_seconds }) => {
    try {
      const task = await lacuna.music.generations.waitFor(id, {
        pollInterval: (poll_interval_seconds ?? 5) * 1000,
        timeout: (timeout_seconds ?? 600) * 1000,
      })
      return { content: [{ type: 'text', text: formatTask(task) }] }
    } catch (err) {
      return toToolError(err)
    }
  }
)

const transport = new StdioServerTransport()
await server.connect(transport)
