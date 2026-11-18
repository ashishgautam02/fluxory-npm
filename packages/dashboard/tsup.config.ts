import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/server/index.ts'],
  outDir: 'dist/server',
  format: ['cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ['ws'],
})
