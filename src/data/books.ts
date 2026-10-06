import type { Testament } from './books.generated.ts'
import type { Reference } from '../types.ts'

/**
 * Fetches a generated asset, preferring the pre-gzipped sibling written by
 * scripts/build-bible.mjs. The Vite dev server does not compress public/, and
 * the search corpus is megabytes, so this is a real saving locally too.
 *
 * The .gz siblings ship in the production output as well; a host is free to
 * serve them already decompressed, so only hand bytes to the decompressor when
 * they really are gzip, and fall back to the plain asset otherwise.
 *
 * Note: no import.meta.env here — scripts/verify.ts runs this module under
 * plain Node, where import.meta.env does not exist.
 */
const gzSupported = typeof DecompressionStream !== 'undefined' && typeof Response !== 'undefined'

async function gunzip(response: Response): Promise<string> {
  const stream = response.body
  if (!stream) throw new Error('empty response body')
  const decompressed = stream.pipeThrough(new DecompressionStream('gzip'))
  return new Response(decompressed).text()
}

export async function fetchText(path: string): Promise<string> {
  if (gzSupported) {
    try {
      const gz = await fetch(`${path}.gz`)
      const type = gz.headers.get('content-type') ?? ''
      if (gz.ok && !type.includes('text/html')) return await gunzip(gz)
    } catch {
      // Fall through to the plain asset.
    }
  }
  const res = await fetch(path)
  if (!res.ok) throw new Error(`Could not load ${path} (HTTP ${res.status})`)
  return res.text()
}

export async function fetchJson<T>(path: string): Promise<T> {
  return JSON.parse(await fetchText(path)) as T
}

export function testamentLabel(t: Testament | 'ALL'): string {
  if (t === 'OT') return 'Old Testament'
  if (t === 'NT') return 'New Testament'
  return 'Whole Bible'
}

export function parseAddress(address: string): Reference | null {
  const parts = address.split(':')
  if (parts.length !== 3) return null
  const b = Number(parts[0])
  const c = Number(parts[1])
  const v = Number(parts[2])
  if (!Number.isInteger(b) || !Number.isInteger(c) || !Number.isInteger(v)) return null
  return { book: b, chapter: c, verse: v }
}
