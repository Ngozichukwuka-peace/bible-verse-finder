import type { Corpus, SearchFilters, SearchHit } from '../types.ts'
import { parseAddress } from '../data/books.ts'
import { testamentOf } from '../data/books.generated.ts'

/**
 * The search core, kept free of worker plumbing so it can be unit tested
 * directly. The corpus arrives pre-lowercased, so a query is just a set of
 * substring scans: roughly 40-80ms across 31k verses, which stays off the main
 * thread because the worker calls this.
 */

type Term = { phrase: string } | { word: string }

/** `"an exact phrase"` becomes one phrase term; bare words become word terms. */
export function parseTerms(raw: string): Term[] {
  const terms: Term[] = []
  const phrasePattern = /"([^"]+)"/g
  let match: RegExpExecArray | null
  while ((match = phrasePattern.exec(raw)) !== null) {
    const value = match[1]?.trim().toLowerCase()
    if (value) terms.push({ phrase: value })
  }
  const remainder = raw.replace(phrasePattern, ' ')
  for (const token of remainder.split(/[\s,]+/)) {
    const word = token.trim().toLowerCase()
    if (word) terms.push({ word })
  }
  return terms
}

function isWordChar(ch: string): boolean {
  return /[a-z0-9']/.test(ch)
}

/** Pushes every non-overlapping occurrence of `needle` onto `out`. */
function findAll(haystack: string, needle: string, out: [number, number][]): void {
  let from = 0
  for (;;) {
    const at = haystack.indexOf(needle, from)
    if (at === -1) return
    out.push([at, at + needle.length])
    from = at + needle.length
  }
}

/** Whole-word matches rank highest, then word-suffix matches, then substrings. */
export function scoreMarks(lower: string, marks: readonly [number, number][]): number {
  let score = 0
  for (const [start, end] of marks) {
    const before = start === 0 ? ' ' : (lower[start - 1] ?? ' ')
    const after = lower[end] ?? ' '
    if (!isWordChar(before) && !isWordChar(after)) score += 10
    else if (!isWordChar(after)) score += 4
    else score += 1
  }
  return score
}

export function mergeMarks(marks: [number, number][]): [number, number][] {
  if (marks.length <= 1) return marks
  const sorted = [...marks].sort((a, b) => a[0] - b[0])
  const out: [number, number][] = [[sorted[0]![0], sorted[0]![1]]]
  for (let i = 1; i < sorted.length; i += 1) {
    const span = sorted[i]!
    const last = out[out.length - 1]!
    if (span[0] <= last[1]) last[1] = Math.max(last[1], span[1])
    else out.push(span)
  }
  return out
}

export interface SearchOutcome {
  hits: SearchHit[]
  total: number
  truncated: boolean
}

export function searchCorpus(
  corpus: Corpus,
  query: string,
  filters: SearchFilters,
  limit: number,
): SearchOutcome {
  const terms = parseTerms(query)
  if (terms.length === 0) return { hits: [], total: 0, truncated: false }

  const bookFilter = filters.books.length > 0 ? new Set(filters.books) : null
  const passBook = (nr: number): boolean => {
    if (bookFilter !== null && !bookFilter.has(nr)) return false
    return filters.testament === 'ALL' || testamentOf(nr) === filters.testament
  }

  const { lower, texts, addresses } = corpus
  const matched: { index: number; score: number; marks: [number, number][] }[] = []

  for (let i = 0; i < lower.length; i += 1) {
    const text = lower[i]!
    const ref = parseAddress(addresses[i] ?? '')
    if (ref === null || !passBook(ref.book)) continue

    const marks: [number, number][] = []
    let allMatched = true
    for (const term of terms) {
      const before = marks.length
      findAll(text, 'phrase' in term ? term.phrase : term.word, marks)
      if (marks.length === before) {
        allMatched = false
        break
      }
    }
    if (allMatched) matched.push({ index: i, score: scoreMarks(text, marks), marks })
  }

  matched.sort((a, b) => b.score - a.score || a.index - b.index)
  const capped = Math.max(1, limit)
  const hits: SearchHit[] = matched.slice(0, capped).map((entry) => ({
    ref: parseAddress(addresses[entry.index] ?? '') ?? { book: 1, chapter: 1, verse: 1 },
    text: texts[entry.index] ?? '',
    highlights: mergeMarks(entry.marks),
  }))

  return { hits, total: matched.length, truncated: matched.length > capped }
}