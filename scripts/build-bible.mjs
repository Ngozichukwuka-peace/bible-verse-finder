/**
 * Downloads the public-domain translations from api.getbible.net and generates
 * the static assets the app reads at runtime. The app itself makes no network
 * calls, so this script is the only thing that needs a connection.
 *
 *   npm run build:bible            # download anything missing
 *   npm run build:bible -- --force # re-download everything
 *
 * Output per translation, in public/bible/<id>/:
 *   index.json      metadata, license/attribution, and per-book chapter counts
 *   book-<nr>.json  the text of one book, lazy-loaded when the book is opened
 *   corpus.txt      every verse joined by U+0001, scanned by the search worker
 *   addresses.txt   "book:chapter:verse" per corpus entry, in the same order
 *
 * Every .json/.txt also gets a pre-gzipped .gz sibling, because the Vite dev
 * server does not compress public/ and the corpus is several megabytes.
 */
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, writeFile, readFile, access, rm, rename, stat, readdir } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { createGzip } from 'node:zlib'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BOOKS, TRANSLATIONS } from './books.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_ROOT = join(ROOT, 'public', 'bible')
const CACHE_ROOT = join(ROOT, '.cache', 'getbible')
const API = 'https://api.getbible.net/v2'
const SEP = '\u0001'

const FORCE = process.argv.includes('--force')
const CONCURRENCY = 3

const log = (...args) => console.log(...args)

const exists = (p) =>
  access(p).then(
    () => true,
    () => false,
  )

const fmtBytes = (n) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`

async function fetchWithRetry(url, attempts = 4) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
      return res
    } catch (error) {
      lastError = error
      if (attempt === attempts) break
      const wait = attempt * 1500
      log(`      retry in ${wait}ms (${error.message})`)
      await new Promise((r) => setTimeout(r, wait))
    }
  }
  throw lastError
}

async function downloadTranslation(meta) {
  const cached = join(CACHE_ROOT, `${meta.id}.json`)
  if (!FORCE && (await exists(cached))) return cached

  await mkdir(CACHE_ROOT, { recursive: true })
  log(`      downloading ${meta.name}...`)
  const res = await fetchWithRetry(`${API}/${meta.id}.json`)
  const tmp = `${cached}.part`
  await pipeline(res.body, createWriteStream(tmp))
  await rename(tmp, cached)
  return cached
}

async function writeFileGz(path, contents) {
  await writeFile(path, contents)
  await pipeline(createReadStream(path), createGzip({ level: 9 }), createWriteStream(`${path}.gz`))
}

function cleanAbout(value) {
  if (typeof value !== 'string') return null
  const text = value
    .replace(/\\par/g, '\n')
    .replace(/\\[a-z]+\d*\s?/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return text || null
}

async function buildTranslation(meta) {
  const cachePath = await downloadTranslation(meta)
  const data = JSON.parse(await readFile(cachePath, 'utf8'))

  const outDir = join(OUT_ROOT, meta.id)
  if (FORCE) await rm(outDir, { recursive: true, force: true })
  await mkdir(outDir, { recursive: true })

  const upstreamBooks = Array.isArray(data.books) ? data.books : []
  const corpus = []
  const addresses = []
  const bookSummaries = []

  for (const metaBook of BOOKS) {
    const upstream = upstreamBooks.find((b) => b.nr === metaBook.nr)
    const upstreamChapters = upstream?.chapters ?? []

    if (upstreamChapters.length === 0) {
      bookSummaries.push({ ...metaBook, available: false, chapterCount: 0 })
      continue
    }

    const payload = {
      nr: metaBook.nr,
      name: metaBook.name,
      chapters: upstreamChapters.map((chapter) => ({
        chapter: chapter.chapter,
        verses: chapter.verses.map((v) => ({ verse: v.verse, text: v.text })),
      })),
    }
    await writeFileGz(join(outDir, `book-${metaBook.nr}.json`), JSON.stringify(payload))

    for (const chapter of payload.chapters) {
      for (const verse of chapter.verses) {
        corpus.push(verse.text)
        addresses.push(`${metaBook.nr}:${chapter.chapter}:${verse.verse}`)
      }
    }

    bookSummaries.push({ ...metaBook, available: true, chapterCount: payload.chapters.length })
  }

  await writeFileGz(join(outDir, 'corpus.txt'), corpus.join(SEP))
  await writeFileGz(join(outDir, 'addresses.txt'), addresses.join('\n'))

  const available = bookSummaries.filter((b) => b.available).length

  const index = {
    id: meta.id,
    name: meta.name,
    short: meta.short,
    partial: available < BOOKS.length,
    language: data.language ?? 'English',
    lang: data.lang ?? 'en',
    direction: data.direction ?? 'LTR',
    license: data.distribution_license ?? null,
    source: data.distribution_source ?? null,
    version: data.distribution_version ?? null,
    about: cleanAbout(data.distribution_about),
    provider: 'api.getbible.net',
    verseCount: corpus.length,
    books: bookSummaries,
  }
  await writeFileGz(join(outDir, 'index.json'), JSON.stringify(index))

  return { index, outDir }
}

async function dirSize(dir) {
  let total = 0
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) total += await dirSize(path)
    else total += (await stat(path)).size
  }
  return total
}

async function writeBooksModule() {
  const banner = '// Generated by scripts/build-bible.mjs from scripts/books.mjs. Do not edit.'
  const lines = [
    banner,
    '',
    "export type Testament = 'OT' | 'NT'",
    '',
    'export interface BookMeta {',
    '  nr: number',
    '  name: string',
    '  abbr: string',
    '  chapters: number',
    '  testament: Testament',
    '}',
    '',
    'export const BOOKS: BookMeta[] = [',
  ]
  for (const b of BOOKS) {
    lines.push(`  { nr: ${b.nr}, name: ${JSON.stringify(b.name)}, abbr: ${JSON.stringify(b.abbr)}, chapters: ${b.chapters}, testament: ${JSON.stringify(b.testament)} },`)
  }
  lines.push(
    ']',
    '',
    'const byNr = new Map(BOOKS.map((b) => [b.nr, b]))',
    'const byName = new Map(BOOKS.map((b) => [b.name.toLowerCase(), b]))',
    '',
    'export function bookByNr(nr: number): BookMeta | undefined {',
    '  return byNr.get(nr)',
    '}',
    '',
    '/** Accepts "John", "john", "1 john", "1jn" and returns undefined otherwise. */',
    'export function bookByName(name: string): BookMeta | undefined {',
    "  const key = name.trim().toLowerCase()",
    '  const direct = byName.get(key)',
    '  if (direct) return direct',
    "  const spaced = key.replace(/\\s+/g, ' ')",
    '  return byName.get(spaced)',
    '}',
    '',
    'export function testamentOf(nr: number): Testament {',
    '  return nr <= 39 ? \'OT\' : \'NT\'',
    '}',
    '',
  )
  await writeFile(join(ROOT, 'src', 'data', 'books.generated.ts'), lines.join('\n'))
}

async function main() {
  await mkdir(join(ROOT, 'src', 'data'), { recursive: true })
  await writeBooksModule()
  log(`Preparing ${TRANSLATIONS.length} translations -> public/bible/\n`)

  const results = []
  let failures = 0

  const queue = [...TRANSLATIONS]
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    for (let meta = queue.shift(); meta; meta = queue.shift()) {
      try {
        const result = await buildTranslation(meta)
        results.push({ meta, ...result })
      } catch (error) {
        failures += 1
        log(`      x ${meta.id}: ${error.message}`)
      }
    }
  })
  await Promise.all(workers)

  results.sort(
    (a, b) => TRANSLATIONS.findIndex((t) => t.id === a.meta.id) - TRANSLATIONS.findIndex((t) => t.id === b.meta.id),
  )

  await mkdir(OUT_ROOT, { recursive: true })
  // writeFileGz, not writeFile: the loader probes the .gz sibling of this file
  // like every other asset, and a missing one is a 404 rather than a miss.
  await writeFileGz(join(OUT_ROOT, 'index.json'), JSON.stringify({ translations: results.map((r) => r.index) }))

  log('')
  for (const { index, outDir } of results) {
    const available = index.books.filter((b) => b.available).length
    log(
      `  ok ${index.short.padEnd(9)} ${String(index.verseCount).padStart(6)} verses  ` +
        `${String(available).padStart(2)}/66 books  ${fmtBytes(await dirSize(outDir))}`,
    )
  }
  log(`\nWrote ${results.length} translations (${fmtBytes(await dirSize(OUT_ROOT))} total).`)

  if (failures > 0) {
    log(`${failures} failed. Re-run to retry; completed downloads are cached in .cache/.`)
    process.exitCode = 1
  }
}

await main()
