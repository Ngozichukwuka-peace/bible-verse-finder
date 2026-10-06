import { useMemo } from 'react'
import { BOOKS } from '../data/books.generated.ts'
import type { TranslationMeta } from '../types.ts'

interface BookListProps {
  translation: TranslationMeta | undefined
  selectedBook: number | null
  testament: 'OT' | 'NT'
  onTestament: (t: 'OT' | 'NT') => void
  onSelect: (nr: number) => void
}

export function BookList({
  translation,
  selectedBook,
  testament,
  onTestament,
  onSelect,
}: BookListProps) {
  const availability = useMemo(() => {
    const map = new Map<number, boolean>()
    for (const book of translation?.books ?? []) map.set(book.nr, book.available)
    return map
  }, [translation])

  const books = useMemo(() => BOOKS.filter((b) => b.testament === testament), [testament])
  const label = testament === 'OT' ? 'Old Testament' : 'New Testament'
  const count = books.length

  return (
    <div className="section">
      <div className="section-title">
        <span>Books</span>
        <span>
          {label} ({count})
        </span>
      </div>
      <div className="testament-tabs book-tabs">
        <button
          type="button"
          className={`btn${testament === 'OT' ? ' btn-active' : ''}`}
          onClick={() => onTestament('OT')}
        >
          OT
        </button>
        <button
          type="button"
          className={`btn${testament === 'NT' ? ' btn-active' : ''}`}
          onClick={() => onTestament('NT')}
        >
          NT
        </button>
      </div>
      <div className="book-grid">
        {books.map((book) => {
          const available = availability.get(book.nr) ?? true
          return (
            <button
              key={book.nr}
              type="button"
              className="book-btn"
              aria-pressed={book.nr === selectedBook}
              disabled={!available}
              onClick={() => onSelect(book.nr)}
              title={
                available
                  ? `${book.name} (${book.chapters} chapters)`
                  : `${book.name} — not included in this version`
              }
            >
              <span>{book.name}</span>
              <span className="book-count">{book.chapters}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
