import { useEffect, useRef } from 'react'
import type { Chapter } from '../types.ts'

interface VerseListProps {
  chapter: Chapter
  selectedVerse: number | null
  onSelect: (verse: number) => void
}

/** Leading whitespace a verse may start with, including a stray non-breaking space. */
const LEADING_SPACE = new RegExp('^[\\s\\u00a0]')

/** KJV-style verse numbering: a small raised number reads better than a bare space. */
function joinVerse(text: string, verse: number): string {
  const needsDot = verse > 1 && !LEADING_SPACE.test(text)
  return needsDot ? `${verse}. ${text}` : `${verse} ${text}`
}

export function VerseList({ chapter, selectedVerse, onSelect }: VerseListProps) {
  const selectedRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (selectedVerse !== null) selectedRef.current?.scrollIntoView({ block: 'nearest' })
  }, [selectedVerse, chapter.chapter])

  return (
    <div className="verse-list">
      {chapter.verses.map((verse) => {
        const isSelected = verse.verse === selectedVerse
        return (
          <div
            key={verse.verse}
            ref={isSelected ? selectedRef : null}
            className={`verse${isSelected ? ' verse-selected' : ''}`}
            onClick={() => onSelect(verse.verse)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSelect(verse.verse)
              }
            }}
            role="button"
            tabIndex={0}
            aria-pressed={isSelected}
          >
            <span className="verse-num">{verse.verse}</span>
            <span className="verse-text">{joinVerse(verse.text, verse.verse)}</span>
          </div>
        )
      })}
    </div>
  )
}