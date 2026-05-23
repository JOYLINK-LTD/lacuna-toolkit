import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    cli: 'src/cli.ts',
  },
  format: ['cjs'],
  dts: false,
  splitting: false,
  sourcemap: true,
  clean: true,
  shims: true,
  target: 'node18',
  noExternal: ['lacuna-sdk'],
  outExtension() {
    return { js: '.cjs' }
  },
})
