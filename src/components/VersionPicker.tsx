import { useMemo } from 'react'
import type { TranslationMeta } from '../types.ts'

interface VersionPickerProps {
  translations: TranslationMeta[]
  activeId: string
  onSelect: (id: string) => void
}

export function VersionPicker({ translations, activeId, onSelect }: VersionPickerProps) {
  const groups = useMemo(() => {
    const complete = translations.filter((t) => !t.partial)
    const partial = translations.filter((t) => t.partial)
    return { complete, partial }
  }, [translations])

  return (
    <div className="section">
      <div className="section-title">
        <span>Version</span>
        <span>{translations.length} available</span>
      </div>
      <div className="version-list">
        {groups.complete.map((t) => (
          <VersionRow key={t.id} meta={t} active={t.id === activeId} onSelect={onSelect} />
        ))}
      </div>
      {groups.partial.length > 0 && (
        <>
          <div className="section-title" style={{ marginTop: 4 }}>
            <span>Partial</span>
          </div>
          <div className="version-list">
            {groups.partial.map((t) => (
              <VersionRow key={t.id} meta={t} active={t.id === activeId} onSelect={onSelect} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function VersionRow({
  meta,
  active,
  onSelect,
}: {
  meta: TranslationMeta
  active: boolean
  onSelect: (id: string) => void
}) {
  return (
    <button
      type="button"
      className="version-row"
      aria-pressed={active}
      onClick={() => onSelect(meta.id)}
      title={meta.name}
    >
      <span className="version-badge">{meta.short}</span>
      <span className="version-name">{meta.name}</span>
      {meta.partial && <span className="tag-partial">PARTIAL</span>}
    </button>
  )
}
