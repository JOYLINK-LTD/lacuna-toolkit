import { defineConfig } from 'tsup'

/**
 * Build config for the MCPB bundle (Smithery / Claude Desktop local install).
 *
 * Unlike the npm build (`tsup.config.ts`), dependencies are inlined so the
 * bundle runs from a plain `node server/index.js` with no `node_modules`.
 */
export default defineConfig({
  entry: {
    index: 'src/index.ts',
  },
  outDir: 'mcpb-build/server',
  format: ['esm'],
  dts: false,
  splitting: false,
  sourcemap: false,
  clean: true,
  shims: true,
  target: 'node18',
  noExternal: [/.*/],
  outExtension() {
    return { js: '.js' }
  },
})
