import type { Testament } from './data/books.generated.ts'

export interface TranslationBook {
  nr: number
  name: string
  abbr: string
  chapters: number
  testament: Testament
  available: boolean
  chapterCount: number
}

export interface TranslationMeta {
  id: string
  name: string
  short: string
  partial: boolean
  language: string
  lang: string
  direction: 'LTR' | 'RTL'
  license: string | null
  source: string | null
  version: string | null
  about: string | null
  provider: string
  verseCount: number
  books: TranslationBook[]
}

export interface TranslationList {
  translations: TranslationMeta[]
}

export interface Verse {
  verse: number
  text: string
}

export interface Chapter {
  chapter: number
  verses: Verse[]
}

export interface BookPayload {
  nr: number
  name: string
  chapters: Chapter[]
}

export interface Reference {
  book: number
  chapter: number
  verse: number
}

export interface SearchHit {
  ref: Reference
  text: string
  /** Case-insensitive [start, end) offsets into `text` for every matched term. */
  highlights: [number, number][]
}

export interface SearchResponse {
  id: number
  total: number
  hits: SearchHit[]
  truncated: boolean
  elapsedMs: number
  /** Set when the query could not be run, e.g. the corpus failed to load. */
  error: string | null
}

export interface SearchFilters {
  testament: Testament | 'ALL'
  books: number[]
}

export type SearchRequest = {
  id: number
  translationId: string
  query: string
  filters: SearchFilters
  limit: number
}

export interface Corpus {
  translationId: string
  /** Verse text in canonical order: book, then chapter, then verse. */
  texts: string[]
  /** `texts` lowercased once, so queries only ever scan lowercase. */
  lower: string[]
  /** `book:chapter:verse` per corpus entry, same order as `texts`. */
  addresses: string[]
}

export interface Bookmark {
  id: string
  translationId: string
  ref: Reference
  text: string
  savedAt: number
}

export interface RecentEntry {
  id: string
  translationId: string
  ref: Reference
  at: number
}

export type Theme = 'light' | 'dark' | 'system'
