import type { Reference, SearchHit } from '../types.ts'
import { bookByNr } from '../data/books.generated.ts'

interface SearchResultsProps {
  hits: SearchHit[]
  total: number
  truncated: boolean
  onSelect: (ref: Reference) => void
}

/** Splits a verse into alternating plain and highlighted runs. */
function segments(text: string, highlights: [number, number][]): { text: string; hit: boolean }[] {
  if (highlights.length === 0) return [{ text, hit: false }]
  const out: { text: string; hit: boolean }[] = []
  let cursor = 0
  for (const [start, end] of highlights) {
    if (start > cursor) out.push({ text: text.slice(cursor, start), hit: false })
    out.push({ text: text.slice(start, end), hit: true })
    cursor = end
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor), hit: false })
  return out
}

export function SearchResults({ hits, total, truncated, onSelect }: SearchResultsProps) {
  return (
    <div>
      <div className="section-title" style={{ marginBottom: 8 }}>
        <span>Results</span>
        <span>
          {hits.length}
          {truncated ? ' of ' : ''}
          {total.toLocaleString()}
        </span>
      </div>
      {hits.map((hit) => {
        const book = bookByNr(hit.ref.book)
        const parts = segments(hit.text, hit.highlights)
        return (
          <button
            key={`${hit.ref.book}.${hit.ref.chapter}.${hit.ref.verse}`}
            type="button"
            className="result"
            onClick={() => onSelect(hit.ref)}
          >
            <span className="result-ref">
              {hit.ref.chapter}:{hit.ref.verse}
              <span className="result-book">{book?.name ?? `Book ${hit.ref.book}`}</span>
            </span>
            <span className="result-text">
              {parts.map((part, i) =>
                part.hit ? <mark key={i}>{part.text}</mark> : <span key={i}>{part.text}</span>,
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}
