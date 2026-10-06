import type { BookPayload, Corpus, Reference, TranslationList, TranslationMeta } from '../types.ts'
import { bookByNr } from '../data/books.generated.ts'
import { fetchJson, fetchText } from '../data/books.ts'

const BASE = `${import.meta.env.BASE_URL}bible`

const translationListPromise = fetchJson<TranslationList>(`${BASE}/index.json`).then((list) =>
  list.translations.filter((t) => Boolean(t.id) && t.verseCount > 0),
)

const metaCache = new Map<string, Promise<TranslationMeta>>()
const bookCache = new Map<string, Promise<BookPayload>>()
const corpusCache = new Map<string, Promise<Corpus>>()

export function listTranslations(): Promise<TranslationMeta[]> {
  return translationListPromise
}

export function translationMeta(id: string): Promise<TranslationMeta> {
  const hit = metaCache.get(id)
  if (hit) return hit
  const p = fetchJson<TranslationMeta>(`${BASE}/${id}/index.json`)
  metaCache.set(id, p)
  // Same rule as bookPayload: a transient failure must not be cached as
  // permanent, and the rejection is handled here so callers can fall back.
  void p.catch(() => {
    if (metaCache.get(id) === p) metaCache.delete(id)
  })
  return p
}

export function bookPayload(id: string, nr: number): Promise<BookPayload> {
  const key = `${id}/${nr}`
  const hit = bookCache.get(key)
  if (hit) return hit
  const p = fetchJson<BookPayload>(`${BASE}/${id}/book-${nr}.json`)
  bookCache.set(key, p)
  // A missing book (a partial translation does not ship every one) must not be
  // cached as a rejection, or that book would stay broken for the session.
  // Handling it here also keeps callers from seeing an unhandled rejection
  // while they render their own fallback.
  void p.catch(() => {
    if (bookCache.get(key) === p) bookCache.delete(key)
  })
  return p
}

/** Loads a whole translation as flat arrays, for the search worker. */
export function loadCorpus(id: string): Promise<Corpus> {
  const hit = corpusCache.get(id)
  if (hit) return hit
  const p = (async () => {
    const [corpusRaw, addressRaw] = await Promise.all([
      fetchText(`${BASE}/${id}/corpus.txt`),
      fetchText(`${BASE}/${id}/addresses.txt`),
    ])
    const texts = corpusRaw.split('\u0001')
    return {
      translationId: id,
      texts,
      lower: texts.map((t) => t.toLowerCase()),
      addresses: addressRaw.split('\n'),
    }
  })()
  corpusCache.set(id, p)
  return p
}

/** Warms the cache for a book the user is likely to open next. */
export function prefetchBook(id: string, nr: number): void {
  void bookPayload(id, nr).catch(() => undefined)
}

export function refToLabel(ref: Reference): string {
  const book = bookByNr(ref.book)
  return `${book?.name ?? `Book ${ref.book}`} ${ref.chapter}:${ref.verse}`
}
