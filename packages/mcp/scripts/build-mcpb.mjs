#!/usr/bin/env node
/**
 * Generates the MCPB manifest and stages bundle assets into `mcpb-build/`.
 *
 * Run after `tsup --config tsup.mcpb.config.ts` has emitted
 * `mcpb-build/server/index.js`; `mcpb pack` turns the staged directory into
 * `lacuna-mcp.mcpb`.
 *
 * Version and description are read from package.json so the bundle never
 * drifts from the published npm package.
 */

import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const buildDir = join(packageRoot, 'mcpb-build')
const entryPoint = join(buildDir, 'server', 'index.js')

if (!existsSync(entryPoint)) {
  console.error('build-mcpb: mcpb-build/server/index.js is missing. Run tsup first.')
  process.exit(1)
}

const pkg = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'))

const manifest = {
  manifest_version: '0.2',
  name: pkg.name,
  display_name: 'Lacuna',
  version: pkg.version,
  description:
    "MCP server for Lacuna's AI Song Generator — generate full songs with AI vocals from any MCP client.",
  long_description:
    'Lacuna is an AI Song Generator that turns a style description and lyrics into a finished track with AI vocals. This server exposes three tools: `generate_music` starts a generation task, `get_generation` reads its current state, and `wait_for_generation` polls until the track is ready and returns the audio URLs. Generation runs on the Lacuna Music API and consumes credits from your Lacuna account; paid plans include commercial rights to the tracks you generate.',
  author: {
    name: 'JOYLINK LTD',
    email: 'support@lacuna.fm',
    url: 'https://www.lacuna.fm',
  },
  homepage: 'https://www.lacuna.fm',
  documentation: 'https://www.lacuna.fm/docs/api',
  support: 'https://github.com/JOYLINK-LTD/lacuna-toolkit/issues',
  icon: 'icon.png',
  server: {
    type: 'node',
    entry_point: 'server/index.js',
    mcp_config: {
      command: 'node',
      args: ['${__dirname}/server/index.js'],
      env: {
        LACUNA_API_KEY: '${user_config.lacuna_api_key}',
      },
    },
  },
  // Clients discover the full JSON tool schemas at runtime. Omitting abbreviated
  // declarations prevents registries from treating them as complete server-card tools.
  tools_generated: true,
  keywords: pkg.keywords,
  license: pkg.license,
  repository: {
    type: 'git',
    url: 'https://github.com/JOYLINK-LTD/lacuna-toolkit',
  },
  user_config: {
    lacuna_api_key: {
      type: 'string',
      title: 'Lacuna API Key',
      description: 'Create one at https://www.lacuna.fm/profile/api',
      sensitive: true,
      required: true,
    },
  },
  compatibility: {
    runtimes: {
      node: '>=18.0.0',
    },
  },
}

writeFileSync(join(buildDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
copyFileSync(join(packageRoot, 'mcpb', 'icon.png'), join(buildDir, 'icon.png'))
copyFileSync(join(packageRoot, 'README.md'), join(buildDir, 'README.md'))
copyFileSync(join(packageRoot, 'LICENSE'), join(buildDir, 'LICENSE'))

console.log(`build-mcpb: staged ${pkg.name}@${pkg.version} in mcpb-build/`)
