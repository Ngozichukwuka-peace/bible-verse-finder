import type { Bookmark, RecentEntry, Reference } from '../types.ts'
import { bookByNr } from '../data/books.generated.ts'
import { refToLabel } from '../lib/loader.ts'

interface SavedDrawerProps {
  bookmarks: Bookmark[]
  recents: RecentEntry[]
  activeBookmarkId: string | null
  onOpen: (ref: Reference, translationId: string) => void
  onRemoveBookmark: (id: string) => void
  onClearRecents: () => void
}

export function SavedDrawer({
  bookmarks,
  recents,
  activeBookmarkId,
  onOpen,
  onRemoveBookmark,
  onClearRecents,
}: SavedDrawerProps) {
  return (
    <>
      <div className="section">
        <div className="section-title">
          <span>Saved</span>
          <span>{bookmarks.length}</span>
        </div>
        {bookmarks.length === 0 ? (
          <p className="hint">Nothing saved yet. Use Save on any verse.</p>
        ) : (
          <div className="mini-list">
            {bookmarks.map((b) => (
              <div key={b.id} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <button
                  type="button"
                  className="mini-row"
                  onClick={() => onOpen(b.ref, b.translationId)}
                  aria-pressed={b.id === activeBookmarkId}
                >
                  <span className="mini-row-text">{b.text}</span>
                  <span className="mini-row-ref">{shortRef(b.ref)}</span>
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => onRemoveBookmark(b.id)}
                  aria-label={`Remove ${refToLabel(b.ref)} from saved`}
                  title="Remove"
                >
                  &#10005;
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="section">
        <div className="section-title">
          <span>Recent</span>
          {recents.length > 0 && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClearRecents}>
              Clear
            </button>
          )}
        </div>
        {recents.length === 0 ? (
          <p className="hint">Verses you open will show up here.</p>
        ) : (
          <div className="mini-list">
            {recents.map((r) => (
              <button
                key={r.id}
                type="button"
                className="mini-row"
                onClick={() => onOpen(r.ref, r.translationId)}
              >
                <span className="mini-row-text">{refToLabel(r.ref)}</span>
                <span className="mini-row-ref">{bookByNr(r.ref.book)?.abbr ?? ''}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

function shortRef(ref: Reference): string {
  return `${bookByNr(ref.book)?.abbr ?? ref.book} ${ref.chapter}:${ref.verse}`
}
