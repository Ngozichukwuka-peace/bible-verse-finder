import type { BookMeta } from '../data/books.generated.ts'
import type { TranslationMeta } from '../types.ts'

interface ChapterGridProps {
  book: BookMeta
  translation: TranslationMeta | undefined
  selectedChapter: number | null
  onSelect: (chapter: number) => void
}

/**
 * Chapters come from the version's own index, so a partial translation only
 * offers the chapters it actually contains.
 */
export function ChapterGrid({ book, translation, selectedChapter, onSelect }: ChapterGridProps) {
  const info = translation?.books.find((b) => b.nr === book.nr)
  const total = info?.available === false ? 0 : (info?.chapterCount ?? book.chapters)

  return (
    <div className="section">
      <div className="section-title">
        <span>Chapters in {book.name}</span>
        <span>{total}</span>
      </div>
      <div className="chapter-grid">
        {Array.from({ length: book.chapters }, (_, i) => i + 1).map((n) => {
          const available = n <= total
          return (
            <button
              key={n}
              type="button"
              className="chapter-btn"
              aria-pressed={n === selectedChapter}
              disabled={!available}
              onClick={() => onSelect(n)}
              title={available ? `${book.name} ${n}` : `${book.name} ${n} — not in this version`}
            >
              {n}
            </button>
          )
        })}
      </div>
      {total === 0 && (
        <p className="hint">
          {book.name} is not included in the selected version. Pick a complete version to read it.
        </p>
      )}
    </div>
  )
}
