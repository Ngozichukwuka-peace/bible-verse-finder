import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * public/bible ships both a plain and a pre-gzipped copy of every asset, and
 * src/data/books.ts prefers the .gz sibling. Dropping them from the output
 * would turn every one of those probes into a 404, so they stay: the client
 * gets compressed bytes directly instead of relying on the host to compress
 * on the fly, and src/data/books.ts falls back to the plain asset if a host
 * decompresses them for us (or serves something unexpected).
 */
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
})
