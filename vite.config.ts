import { readdir, stat, unlink } from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * public/bible holds both a plain and a pre-gzipped copy of every asset so the
 * dev server (which does not compress public/) stays fast. A production host
 * almost always applies its own gzip or brotli, so shipping both copies would
 * double the deploy for nothing. This drops the .gz siblings from the output.
 */
function dropPrecompressedAssets(): Plugin {
  const outDir = 'dist/bible'
  return {
    name: 'drop-precompressed-assets',
    apply: 'build',
    async writeBundle() {
      const removed = await prune(outDir)
      if (removed > 0) {
        this.info(`dropped ${removed} pre-gzipped asset(s); the host will compress instead`)
      }
    },
  }
}

async function prune(dir: string): Promise<number> {
  let count = 0
  let entries: Dirent[]
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return 0
  }
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      count += await prune(path)
    } else if (entry.name.endsWith('.gz') && (await stat(path)).size > 0) {
      await unlink(path)
      count += 1
    }
  }
  return count
}

export default defineConfig({
  plugins: [react(), dropPrecompressedAssets()],
  server: { port: 5173 },
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
})