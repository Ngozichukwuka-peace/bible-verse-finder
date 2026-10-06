import { useEffect, useRef, useState } from 'react'
import { BOOKS } from '../data/books.generated.ts'
import type { SearchFilters } from '../types.ts'
import { testamentLabel } from '../data/books.ts'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  filters: SearchFilters
  onFilters: (filters: SearchFilters) => void
  busy: boolean
  indexed: boolean
  total: number
  elapsedMs: number
  truncated: boolean
  error: string | null
}

export function SearchBar({
  value,
  onChange,
  filters,
  onFilters,
  busy,
  indexed,
  total,
  elapsedMs,
  truncated,
  error,
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      if (event.key === '/' && !typing) {
        event.preventDefault()
        inputRef.current?.focus()
      }
      if (event.key === 'Escape' && document.activeElement === inputRef.current) {
        inputRef.current?.blur()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const hasFilters = filters.testament !== 'ALL' || filters.books.length > 0

  return (
    <div className="section search-bar">
      <div className="search-wrap">
        <span className="search-icon" aria-hidden="true">
          &#9906;
        </span>
        <input
          ref={inputRef}
          className="search-input"
          type="search"
          value={value}
          placeholder="Search every word&hellip;  (press / )"
          aria-label="Search the Bible"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
        />
        {value !== '' && (
          <button type="button" className="search-clear" onClick={() => onChange('')} aria-label="Clear search">
            &#10005;
          </button>
        )}
      </div>

      <div className="search-status">
        <button
          type="button"
          className={`btn btn-sm${showFilters || hasFilters ? ' btn-active' : ''}`}
          onClick={() => setShowFilters((v) => !v)}
          aria-expanded={showFilters}
        >
          Filters{hasFilters ? ' (on)' : ''}
        </button>
        {value.trim() !== '' && (
          <>
            {error !== null ? (
              <span className="search-error">{error}</span>
            ) : busy ? (
              <span className="spinner" aria-label="Searching" />
            ) : (
              <span>
                {total.toLocaleString()} {total === 1 ? 'verse' : 'verses'}
                {truncated ? ' (showing first)' : ''}
                {!indexed ? ' &middot; index loading' : ''}
              </span>
            )}
            <span className="hint">{elapsedMs.toFixed(0)}ms</span>
          </>
        )}
        <span className="hint">
          Bare words match all &middot; <code>&quot;an exact phrase&quot;</code> for a phrase
        </span>
      </div>

      {showFilters && (
        <div className="filters">
          <select
            className="field"
            value={filters.testament}
            aria-label="Filter by testament"
            onChange={(e) =>
              onFilters({
                ...filters,
                testament: e.target.value as SearchFilters['testament'],
                books: [],
              })
            }
          >
            <option value="ALL">Whole Bible</option>
            <option value="OT">Old Testament</option>
            <option value="NT">New Testament</option>
          </select>

          <select
            className="field"
            value={filters.books.length === 1 ? String(filters.books[0]) : 'ANY'}
            aria-label="Filter by book"
            onChange={(e) => {
              const value = e.target.value
              onFilters({ ...filters, books: value === 'ANY' ? [] : [Number(value)] })
            }}
          >
            <option value="ANY">Any book</option>
            {BOOKS.map((book) => (
              <option key={book.nr} value={book.nr}>
                {book.testament === 'OT' ? '' : 'NT · '}
                {book.name}
              </option>
            ))}
          </select>

          {hasFilters && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => onFilters({ testament: 'ALL', books: [] })}
            >
              Clear
            </button>
          )}
          <span className="hint">{testamentLabel(filters.testament)}</span>
        </div>
      )}
    </div>
  )
}
