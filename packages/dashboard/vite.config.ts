import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname, 'src/ui'),
  build: {
    outDir: resolve(__dirname, 'dist/ui'),
    emptyOutDir: true,
  },
  server: {
    port: 4001,
    proxy: {
      '/api': 'http://localhost:4000',
      '/ws': { target: 'ws://localhost:4000', ws: true },
    },
  },
})
