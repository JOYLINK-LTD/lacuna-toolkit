import { defineConfig } from 'tsup'

import { version } from './package.json'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    webhooks: 'src/webhooks.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  shims: true,
  target: 'node18',
  // 把 package.json 的版本号烘进产物，src/version.ts 不再手写常量（见那里的注释）
  define: {
    __SDK_VERSION__: JSON.stringify(version),
  },
  outExtension({ format }) {
    return { js: format === 'cjs' ? '.cjs' : '.js' }
  },
})
