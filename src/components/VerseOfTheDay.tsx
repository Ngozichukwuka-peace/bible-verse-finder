import { useEffect, useState } from 'react'
import type { Reference, TranslationBook, TranslationMeta } from '../types.ts'
import { bookByNr } from '../data/books.generated.ts'
import { bookPayload } from '../lib/loader.ts'

interface VerseOfTheDayProps {
  translationId: string
  translation: TranslationMeta | undefined
  onOpen: (ref: Reference) => void
}

/**
 * A deterministic daily pick. Every step is derived from the day number, so it
 * stays put for the whole day, changes tomorrow, and never needs storing. The
 * verse is chosen from what the translation actually contains, so partial
 * versions only ever pick books they include.
 */

interface Entry {
  ref: Reference
  text: string
}

/** Deterministic pick from the books this version actually contains. */
function pickBook(translation: TranslationMeta | undefined): TranslationBook | null {
  if (translation === undefined) return null
  const usable = translation.books.filter((b) => b.available && b.chapterCount > 0)
  const pick = usable[dayNumber() % usable.length]
  return pick ?? null
}

function dayNumber(): number {
  const now = new Date()
  return Math.floor((Date.now() - Date.UTC(now.getFullYear(), 0, 0)) / 86_400_000)
}

export function VerseOfTheDay({ translationId, translation, onOpen }: VerseOfTheDayProps) {
  const [cache, setCache] = useState<{ key: string; entry: Entry } | null>(null)

  const book = pickBook(translation)
  const key = book === null ? '' : `${translationId}:${book.nr}`
  const entry = cache?.key === key ? cache.entry : null

  useEffect(() => {
    if (book === null) return
    const chapterNumber = 1 + ((dayNumber() * 31) % book.chapterCount)
    let cancelled = false

    void (async () => {
      try {
        const payload = await bookPayload(translationId, book.nr)
        const chapter = payload.chapters.find((c) => c.chapter === chapterNumber)
        const verse = chapter?.verses[(dayNumber() * 17) % (chapter?.verses.length ?? 1)]
        if (cancelled || chapter === undefined || verse === undefined) return
        setCache({
          key: `${translationId}:${book.nr}`,
          entry: { ref: { book: book.nr, chapter: chapter.chapter, verse: verse.verse }, text: verse.text },
        })
      } catch {
        setCache(null)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [translationId, book])

  if (entry === null) return null
  const meta = bookByNr(entry.ref.book)

  return (
    <div className="section">
      <div className="section-title">
        <span>Verse of the day</span>
      </div>
      <div className="votd-card">
        <div className="votd-ref">
          {meta?.name} {entry.ref.chapter}:{entry.ref.verse} &middot; {translation?.short}
        </div>
        <div className="votd-text">{entry.text}</div>
        <div className="control-row" style={{ marginTop: 10 }}>
          <button type="button" className="btn btn-sm" onClick={() => onOpen(entry.ref)}>
            Open
          </button>
        </div>
      </div>
    </div>
  )
}