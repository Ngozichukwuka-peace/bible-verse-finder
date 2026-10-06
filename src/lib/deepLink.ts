import type { Reference } from '../types.ts'
import { BOOKS, bookByNr } from '../data/books.generated.ts'

/**
 * Routes live in the hash so the app works from any static host and a copied
 * link restores the exact verse and translation.
 *
 *   #/john/3/16?tr=web    a verse
 *   #/john/3?tr=web       a chapter
 *   #/john?tr=web         a book
 */

export interface Route {
  book: number | null
  chapter: number | null
  verse: number | null
  translation: string | null
}

export const EMPTY_ROUTE: Route = { book: null, chapter: null, verse: null, translation: null }

const byName = new Map<string, number>()
for (const book of BOOKS) {
  byName.set(book.name.toLowerCase(), book.nr)
  byName.set(book.abbr.toLowerCase(), book.nr)
}

/** Extra shorthands so "jn", "1co", "ps" and friends resolve. */
const ABBR: Record<string, string> = {
  gen: 'Genesis', ex: 'Exodus', exod: 'Exodus', lev: 'Leviticus', num: 'Numbers',
  deut: 'Deuteronomy', josh: 'Joshua', judg: 'Judges', jg: 'Judges', rut: 'Ruth',
  '1sam': '1 Samuel', '2sam': '2 Samuel', '1kgs': '1 Kings', '2kgs': '2 Kings',
  '1chr': '1 Chronicles', '2chr': '2 Chronicles', neh: 'Nehemiah', esth: 'Esther',
  ps: 'Psalms', psa: 'Psalms', pro: 'Proverbs', prov: 'Proverbs',
  ecc: 'Ecclesiastes', eccl: 'Ecclesiastes', song: 'Song of Solomon',
  'song of songs': 'Song of Solomon', isa: 'Isaiah', jer: 'Jeremiah',
  lam: 'Lamentations', ezek: 'Ezekiel', dan: 'Daniel', hos: 'Hosea', amos: 'Amos',
  obad: 'Obadiah', jon: 'Jonah', mic: 'Micah', nah: 'Nahum', hab: 'Habakkuk',
  zeph: 'Zephaniah', hag: 'Haggai', zech: 'Zechariah', mal: 'Malachi',
  matt: 'Matthew', mt: 'Matthew', mk: 'Mark', mrk: 'Mark', lk: 'Luke',
  jn: 'John', jhn: 'John', act: 'Acts',
  rom: 'Romans', ro: 'Romans', '1cor': '1 Corinthians', '2cor': '2 Corinthians',
  gal: 'Galatians', eph: 'Ephesians', phil: 'Philippians', php: 'Philippians',
  col: 'Colossians', '1thess': '1 Thessalonians', '2thess': '2 Thessalonians',
  '1tim': '1 Timothy', '2tim': '2 Timothy', tit: 'Titus', phlm: 'Philemon',
  heb: 'Hebrews', jas: 'James', jam: 'James',
  '1pet': '1 Peter', '2pet': '2 Peter', '1john': '1 John', '2john': '2 John',
  '3john': '3 John', jude: 'Jude', rev: 'Revelation', apoc: 'Revelation',
}

/** Turns any accepted book token into a book number, or null. */
export function resolveBookNr(token: string): number | null {
  const key = token.trim().toLowerCase()
  if (key === '') return null

  // buildHash writes abbrs like "song-of-solomon", so accept dashes and
  // underscores as spaces too.
  for (const candidate of new Set([key, key.replace(/[-_]+/g, ' ')])) {
    const direct = byName.get(candidate)
    if (direct !== undefined) return direct
  }

  const loose = key.replace(/[-_]+/g, ' ')

  // "1 jn" -> "1 john", "psa" -> "psalms"
  const numbered = /^([123])\s*(\S+)$/.exec(loose)
  if (numbered) {
    const num = numbered[1]!
    const rest = numbered[2]!
    const expanded = ABBR[rest] ?? rest
    const nr = byName.get(`${num} ${expanded}`.toLowerCase())
    if (nr !== undefined) return nr
  }

  const expanded = ABBR[loose]
  if (expanded !== undefined) {
    const nr = byName.get(expanded.toLowerCase())
    if (nr !== undefined) return nr
  }

  return null
}

function positiveInt(value: string | undefined): number | null {
  if (value === undefined) return null
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : null
}

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '')
  const [pathPart = '', queryPart = ''] = raw.split('?')

  const route: Route = { ...EMPTY_ROUTE }
  const tr = new URLSearchParams(queryPart).get('tr')
  if (tr !== null) route.translation = tr

  const segments = pathPart.split('/').filter((s) => s !== '')
  const first = segments[0]
  if (first === undefined) return route

  const book = resolveBookNr(safeDecode(first))
  if (book === null) return route
  route.book = book

  const chapter = positiveInt(segments[1] === undefined ? undefined : safeDecode(segments[1]))
  if (chapter !== null && chapter <= (bookByNr(book)?.chapters ?? chapter)) {
    route.chapter = chapter
    route.verse = positiveInt(segments[2] === undefined ? undefined : safeDecode(segments[2]))
  }
  return route
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export function buildHash(ref: Reference | null, translationId: string): string {
  if (ref === null) return `#/?tr=${translationId}`
  const book = bookByNr(ref.book)
  const name = encodeURIComponent((book?.abbr ?? String(ref.book)).toLowerCase().replace(/\s+/g, '-'))
  const chapter = ref.chapter === 0 ? '' : `/${ref.chapter}`
  const verse = ref.chapter === 0 || ref.verse === 0 ? '' : `/${ref.verse}`
  return `#/${name}${chapter}${verse}?tr=${translationId}`
}

export function shareUrl(ref: Reference, translationId: string): string {
  return `${window.location.origin}${window.location.pathname}${buildHash(ref, translationId)}`
}
