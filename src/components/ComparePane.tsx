import { useEffect, useState } from 'react'
import type { Reference, TranslationMeta } from '../types.ts'
import { bookPayload } from '../lib/loader.ts'

interface ComparePaneProps {
  selected: Reference | null
  translationId: string
  translations: TranslationMeta[]
  onSelectTranslation: (id: string) => void
  open: boolean
}

interface Entry {
  meta: TranslationMeta
  text: string | null
}

/** Entries are cached against the verse they belong to, so switching verses never
 *  briefly shows the previous verse's text. */
function useCompareEntries(
  selected: Reference | null,
  translations: TranslationMeta[],
): Entry[] {
  const [cache, setCache] = useState<{ key: string; entries: Entry[] } | null>(null)

  const key = selected === null ? '' : `${selected.book}.${selected.chapter}.${selected.verse}`

  useEffect(() => {
    if (selected === null || key === '') return
    let cancelled = false
    void (async () => {
      const found = await Promise.all(
        translations.map(async (meta) => ({ meta, text: await verseText(meta, selected) })),
      )
      if (!cancelled) setCache({ key, entries: found })
    })()
    return () => {
      cancelled = true
    }
  }, [translations, selected, key])

  if (selected === null) return []
  if (cache?.key !== key) return []
  return cache.entries
}

async function verseText(meta: TranslationMeta, ref: Reference): Promise<string | null> {
  const info = meta.books.find((b) => b.nr === ref.book)
  if (info === undefined || !info.available) return null
  try {
    const payload = await bookPayload(meta.id, ref.book)
    return (
      payload.chapters.find((c) => c.chapter === ref.chapter)?.verses.find((v) => v.verse === ref.verse)
        ?.text ?? null
    )
  } catch {
    return null
  }
}

export function ComparePane({
  selected,
  translationId,
  translations,
  onSelectTranslation,
  open,
}: ComparePaneProps) {
  const entries = useCompareEntries(selected, translations)

  if (selected === null) {
    return (
      <aside className="pane pane-compare">
        <p className="empty">Select a verse to see it in every version.</p>
      </aside>
    )
  }

  return (
    <aside className={`pane pane-compare${open ? '' : ' collapsed'}`}>
      <div className="section-title" style={{ marginBottom: 10 }}>
        <span>Compare</span>
        <span>{entries.filter((e) => e.text !== null).length} of {translations.length}</span>
      </div>
      {entries.length === 0 && (
        <p className="empty">
          <span className="spinner" /> Loading {translations.length} versions&hellip;
        </p>
      )}
      {entries.map((entry) => (
        <button
          key={entry.meta.id}
          type="button"
          className="compare-item"
          onClick={() => onSelectTranslation(entry.meta.id)}
          title={`Read ${selected.chapter}:${selected.verse} in ${entry.meta.name}`}
        >
          <span className="compare-head">
            <span
              className={`version-badge${entry.meta.id === translationId ? ' is-active' : ''}`}
            >
              {entry.meta.short}
            </span>
            {entry.meta.partial && <span className="tag-partial">PARTIAL</span>}
          </span>
          {entry.text === null ? (
            <span className="compare-missing">Not in this version</span>
          ) : (
            <span className="compare-text">{entry.text}</span>
          )}
        </button>
      ))}
    </aside>
  )
}
