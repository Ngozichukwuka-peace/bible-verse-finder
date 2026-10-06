import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type {
  BookPayload,
  Bookmark,
  Chapter,
  RecentEntry,
  Reference,
  SearchFilters,
  SearchResponse,
  TranslationMeta,
} from './types.ts'
import { bookByNr } from './data/books.generated.ts'
import { bookPayload, listTranslations, prefetchBook, refToLabel, translationMeta } from './lib/loader.ts'
import { useHashRoute } from './lib/useHashRoute.ts'
import { SearchClient } from './lib/search.ts'
import { shareUrl } from './lib/deepLink.ts'
import {
  clearRecents,
  loadBookmarks,
  loadRecents,
  loadSettings,
  pushRecent,
  refKey,
  removeBookmark,
  saveSettings,
  toggleBookmark,
  type Settings,
} from './lib/storage.ts'
import { isSpeaking, speak, speechSupported, stopSpeaking } from './lib/speech.ts'
import { BookList } from './components/BookList.tsx'
import { ChapterGrid } from './components/ChapterGrid.tsx'
import { ComparePane } from './components/ComparePane.tsx'
import { SavedDrawer } from './components/SavedDrawer.tsx'
import { SearchBar } from './components/SearchBar.tsx'
import { SearchResults } from './components/SearchResults.tsx'
import { SettingsBar } from './components/SettingsBar.tsx'
import { VerseList } from './components/VerseList.tsx'
import { VerseOfTheDay } from './components/VerseOfTheDay.tsx'
import { VersionPicker } from './components/VersionPicker.tsx'

const DEFAULT_TRANSLATION = 'kjv'
const HOME: Reference = { book: 43, chapter: 3, verse: 16 }

export default function App() {
  const [route, navigate] = useHashRoute()
  const [settings, setSettings] = useState<Settings>(() => loadSettings())
  const [translations, setTranslations] = useState<TranslationMeta[]>([])
  const [metaCache, setMetaCache] = useState<{ id: string; meta: TranslationMeta } | null>(null)
  const [metaFailed, setMetaFailed] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<SearchFilters>({ testament: 'ALL', books: [] })
  const [searchCache, setSearchCache] = useState<{ key: string; response: SearchResponse } | null>(
    null,
  )
  const [indexedId, setIndexedId] = useState<string | null>(null)
  const [payloadCache, setPayloadCache] = useState<{ key: string; payload: BookPayload } | null>(null)
  /** Which translation/book failed to load, so the reader explains it. */
  const [failedBook, setFailedBook] = useState<string | null>(null)

  const [bookmarks, setBookmarks] = useState<Bookmark[]>(() => loadBookmarks())
  const [recents, setRecents] = useState<RecentEntry[]>(() => loadRecents())
  const [toast, setToast] = useState<string | null>(null)
  const [creditsOpen, setCreditsOpen] = useState(false)
  const [voiceURI, setVoiceURI] = useState<string | null>(null)
  const [testamentOverride, setTestamentOverride] = useState<'OT' | 'NT' | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [compareOpen, setCompareOpen] = useState(false)

  const searchClient = useRef<SearchClient | null>(null)
  if (searchClient.current === null) searchClient.current = new SearchClient()

  /* ------------------------------------------------------------- settings */

  const activeTheme = useSystemTheme(settings.theme)
  useEffect(() => {
    document.documentElement.dataset.theme = activeTheme
  }, [activeTheme])

  useEffect(() => {
    document.documentElement.dataset.font = settings.fontFamily
    document.documentElement.style.setProperty('--verse-size', `${settings.fontSize}px`)
  }, [settings.fontFamily, settings.fontSize])

  const updateSettings = useCallback((next: Settings) => {
    setSettings(next)
    saveSettings(next)
  }, [])

  const flash = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast((t) => (t === message ? null : t)), 1900)
  }, [])

  /* --------------------------------------------------------- translations */

  useEffect(() => {
    let cancelled = false
    void listTranslations().then((list) => {
      if (!cancelled) setTranslations(list)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const translationId = useMemo(() => {
    const fromRoute = route.translation
    if (fromRoute !== null && translations.some((t) => t.id === fromRoute)) return fromRoute
    if (translations.some((t) => t.id === settings.lastTranslation)) {
      return settings.lastTranslation ?? DEFAULT_TRANSLATION
    }
    return translations.some((t) => t.id === DEFAULT_TRANSLATION)
      ? DEFAULT_TRANSLATION
      : (translations[0]?.id ?? DEFAULT_TRANSLATION)
  }, [route.translation, settings.lastTranslation, translations])

  useEffect(() => {
    let cancelled = false
    void translationMeta(translationId)
      .then((next) => {
        if (!cancelled) setMetaCache({ id: translationId, meta: next })
      })
      .catch(() => {
        // Keep reading rather than hanging: the book list can still fall back
        // to canonical chapter counts.
        if (!cancelled) setMetaFailed(translationId)
      })
    return () => {
      cancelled = true
    }
  }, [translationId])

  const meta = metaCache?.id === translationId ? metaCache.meta : undefined
  /** The index tells us which books a partial version ships, so we never
   * request a file that does not exist. */
  const metaReady = meta !== undefined || metaFailed === translationId

  const selectTranslation = useCallback(
    (id: string) => {
      updateSettings({ ...settings, lastTranslation: id })
      const ref = currentRef(route, null)
      navigate(ref, id)
    },
    [navigate, route, settings, updateSettings],
  )

  /* ------------------------------------------------------------- searching */

  useEffect(() => {
    const client = searchClient.current
    if (client === null) return
    let cancelled = false
    void client
      .ensureIndex(translationId)
      .then(() => {
        if (!cancelled) setIndexedId(translationId)
      })
      .catch(() => {
        if (!cancelled) setIndexedId(null)
      })
    return () => {
      cancelled = true
    }
  }, [translationId])

  const indexed = indexedId === translationId

  /** Results are keyed by everything that produced them, so stale ones never show. */
  const searchKey = `${translationId}|${query}|${filters.testament}|${filters.books.join(',')}|${
    indexed ? '1' : '0'
  }`
  const search = searchCache?.key === searchKey ? searchCache.response : null
  const searching = query.trim() !== '' && indexed && search === null

  useEffect(() => {
    const client = searchClient.current
    if (client === null || query.trim() === '' || !indexed) return
    let cancelled = false
    const key = searchKey
    void client.search(translationId, query, filters).then((response) => {
      if (cancelled) return
      setSearchCache({ key, response })
    })
    return () => {
      cancelled = true
    }
  }, [query, filters, translationId, indexed, searchKey])

  const applyFilters = useCallback(
    (next: SearchFilters) => {
      setFilters(next)
      const client = searchClient.current
      if (client === null || query.trim() === '' || !indexed) return
      const key = `${translationId}|${query}|${next.testament}|${next.books.join(',')}|1`
      void client.rerun(translationId, next).then((response) => setSearchCache({ key, response }))
    },
    [translationId, query, indexed],
  )

  /* ---------------------------------------------------------------- reader */

  const selectedRef = useMemo<Reference | null>(
    () =>
      route.book !== null && route.chapter !== null && route.verse !== null
        ? { book: route.book, chapter: route.chapter, verse: route.verse }
        : null,
    [route.book, route.chapter, route.verse],
  )

  const book = route.book !== null ? (bookByNr(route.book) ?? null) : null
  const openBook = route.book ?? (book?.nr ?? null)

  useEffect(() => {
    if (book !== null) prefetchBook(translationId, book.nr)
  }, [book, translationId])

  useEffect(() => {
    if (openBook === null || !metaReady) return
    // The index already knows which books this version ships, so never ask for
    // a file that is not there. Whether that happened is derived below rather
    // than stored, so this stays a pure effect.
    if (meta?.books.find((b) => b.nr === openBook)?.available === false) return
    const key = `${translationId}/${openBook}`
    let cancelled = false
    void bookPayload(translationId, openBook)
      .then((payload) => {
        if (!cancelled) setPayloadCache({ key, payload })
      })
      .catch(() => {
        // A book this translation does not ship is a valid outcome, not a
        // loading state. Without this the reader span forever.
        if (!cancelled) setFailedBook(key)
      })
    return () => {
      cancelled = true
    }
  }, [openBook, translationId, metaReady, meta])

  const bookKey = openBook === null ? null : `${translationId}/${openBook}`
  const bookUnavailable =
    openBook !== null && meta?.books.find((b) => b.nr === openBook)?.available === false
  const bookFailed = bookKey !== null && failedBook === bookKey
  const payload = bookKey !== null && payloadCache?.key === bookKey ? payloadCache.payload : null
  const loadingBook = openBook !== null && payload === null && !bookUnavailable && !bookFailed
  const testament = testamentOverride ?? book?.testament ?? 'NT'

  const chapter: Chapter | null = useMemo(() => {
    if (payload === null || route.chapter === null) return null
    return payload.chapters.find((c) => c.chapter === route.chapter) ?? null
  }, [payload, route.chapter])

  useEffect(() => {
    if (!speechSupported()) return
    return () => stopSpeaking()
  }, [])

  const openRef = useCallback(
    (ref: Reference, id = translationId) => {
      navigate(ref, id)
      setRecents(pushRecent(id, ref))
      setSidebarOpen(false)
      setCompareOpen(true)
      if (query.trim() !== '') setQuery('')
    },
    [navigate, translationId, query],
  )

  const selectedVerse = chapter?.verses.find((v) => v.verse === selectedRef?.verse) ?? null
  const selectedText = selectedVerse?.text ?? null

  const bookmarkId = selectedRef === null ? null : refKey(translationId, selectedRef)
  const isBookmarked = bookmarkId !== null && bookmarks.some((b) => b.id === bookmarkId)

  const onSave = useCallback(() => {
    if (selectedRef === null || selectedText === null) return
    const entry: Bookmark = {
      id: refKey(translationId, selectedRef),
      translationId,
      ref: selectedRef,
      text: selectedText,
      savedAt: Date.now(),
    }
    setBookmarks((current) => toggleBookmark(entry, current))
    flash(isBookmarked ? 'Removed from saved' : 'Saved')
  }, [selectedRef, selectedText, translationId, isBookmarked, flash])

  const onCopy = useCallback(async () => {
    if (selectedRef === null || selectedText === null) return
    const body = `${refToLabel(selectedRef)}\n\n${selectedText}\n\n${meta?.name ?? translationId} · via Bible Verse Finder`
    try {
      await navigator.clipboard.writeText(body)
      flash('Copied with reference')
    } catch {
      flash('Copy failed')
    }
  }, [selectedRef, selectedText, meta, translationId, flash])

  const onShare = useCallback(async () => {
    if (selectedRef === null) return
    const url = shareUrl(selectedRef, translationId)
    const data = { title: refToLabel(selectedRef), text: selectedText ?? '', url }
    if (navigator.share) {
      try {
        await navigator.share(data)
        return
      } catch {
        // Fall through to copying the link.
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      flash('Link copied')
    } catch {
      flash('Could not copy link')
    }
  }, [selectedRef, selectedText, translationId, flash])

  const onRead = useCallback(() => {
    if (chapter === null) return
    const text = selectedVerse?.text ?? chapter.verses.map((v) => v.text).join(' ')
    speak({ text: `${refToLabel({ book: payload?.nr ?? 1, chapter: chapter.chapter, verse: selectedRef?.verse ?? 1 })}. ${text}`, voiceURI })
    flash('Reading aloud')
  }, [chapter, selectedVerse, selectedRef, payload, voiceURI, flash])

  useEffect(() => {
    if (!speechSupported()) return
    return () => stopSpeaking()
  }, [])

  const onKeyNav = useCallback(
    (delta: number) => {
      if (chapter === null) return
      const list = chapter.verses
      const index = list.findIndex((v) => v.verse === selectedRef?.verse)
      const next = list[index + delta] ?? list[index === -1 ? 0 : index + delta]
      if (next === undefined) return
      openRef({ book: openBook ?? 1, chapter: chapter.chapter, verse: next.verse })
    },
    [chapter, selectedRef, openBook, openRef],
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return
      }
      if (event.key === 'ArrowDown' || event.key === 'j') {
        event.preventDefault()
        onKeyNav(1)
      } else if (event.key === 'ArrowUp' || event.key === 'k') {
        event.preventDefault()
        onKeyNav(-1)
      } else if (event.key === 'b') {
        onSave()
      } else if (event.key === 'c') {
        void onCopy()
      } else if (event.key === 'Escape') {
        setCreditsOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onKeyNav, onSave, onCopy])

  /* ------------------------------------------------------------------ view */

  const chapterInfo = book === null ? null : meta?.books.find((b) => b.nr === book.nr)
  const chapterTotal =
    book === null || chapterInfo?.available === false
      ? 0
      : ((chapterInfo?.chapterCount ?? book.chapters))

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          Bible Verse Finder <small>offline</small>
        </div>

        <SearchBar
          value={query}
          onChange={setQuery}
          filters={filters}
          onFilters={applyFilters}
          busy={searching}
          indexed={indexed}
          total={search?.total ?? 0}
          elapsedMs={search?.elapsedMs ?? 0}
          truncated={search?.truncated ?? false}
          error={search?.error ?? null}
        />

        <div className="topbar-spacer" />

        <SettingsBar
          settings={settings}
          onSettings={updateSettings}
          translation={meta}
          translations={translations}
          voiceURI={voiceURI}
          onVoice={setVoiceURI}
          creditsOpen={creditsOpen}
          onCredits={setCreditsOpen}
        />

        <button
          type="button"
          className="btn btn-sm"
          onClick={() => setSidebarOpen((v) => !v)}
          aria-expanded={sidebarOpen}
        >
          Browse
        </button>
      </header>

      <div className="body">
        <aside className={`pane pane-sidebar${sidebarOpen ? '' : ' collapsed'}`}>
          <VersionPicker
            translations={translations}
            activeId={translationId}
            onSelect={selectTranslation}
          />
          <BookList
            translation={meta}
            selectedBook={openBook}
            testament={testament}
            onTestament={setTestamentOverride}
            onSelect={(nr) => {
              navigate({ book: nr, chapter: 1, verse: 1 }, translationId)
              prefetchBook(translationId, nr)
            }}
          />
          <VerseOfTheDay
            translationId={translationId}
            translation={meta}
            onOpen={openRef}
          />
          <SavedDrawer
            bookmarks={bookmarks}
            recents={recents}
            activeBookmarkId={bookmarkId}
            onOpen={openRef}
            onRemoveBookmark={(id) => setBookmarks((current) => removeBookmark(id, current))}
            onClearRecents={() => setRecents(clearRecents())}
          />
        </aside>

        <main className="pane pane-main">
          {query.trim() !== '' ? (
            <>
              {search?.error !== null && search !== null && <p className="hint">{search.error}</p>}
              {search !== null && search.hits.length > 0 && (
                <SearchResults
                  hits={search.hits}
                  total={search.total}
                  truncated={search.truncated}
                  onSelect={(ref) => openRef(ref)}
                />
              )}
              {search !== null && search.hits.length === 0 && search.error === null && (
                <p className="empty">
                  No verses match <strong>{query}</strong>.
                  <br />
                  Try fewer words, or check the spelling.
                </p>
              )}
              {search === null && <p className="empty">Type to search every verse.</p>}
            </>
          ) : (
            <>
              {book !== null && (
                <>
                  <div className="reader-head">
                    <div className="crumb">
                      <span className="crumb-book">{book.name}</span>
                      {route.chapter !== null && (
                        <>
                          <span className="crumb-sep">&rsaquo;</span>
                          <span>Chapter {route.chapter}</span>
                        </>
                      )}
                    </div>
                    <div className="topbar-spacer" />
                    {selectedRef !== null && (
                      <>
                        <button
                          type="button"
                          className={`btn btn-sm${compareOpen ? ' btn-active' : ''}`}
                          onClick={() => setCompareOpen((v) => !v)}
                          aria-pressed={compareOpen}
                        >
                          Compare
                        </button>
                        <button type="button" className="btn btn-sm" onClick={onCopy} title="Copy (c)">
                          Copy
                        </button>
                        <button type="button" className="btn btn-sm" onClick={onShare} title="Share">
                          Share
                        </button>
                        <button
                          type="button"
                          className={`btn btn-sm${isBookmarked ? ' btn-active' : ''}`}
                          onClick={onSave}
                          title="Save (b)"
                        >
                          {isBookmarked ? 'Saved' : 'Save'}
                        </button>
                        {speechSupported() && (
                          <button
                            type="button"
                            className={`btn btn-sm${isSpeaking() ? ' btn-active' : ''}`}
                            onClick={onRead}
                          >
                            Read
                          </button>
                        )}
                      </>
                    )}
                  </div>

                  {route.chapter === null ? (
                    <>
                      <ChapterGrid
                        book={book}
                        translation={meta}
                        selectedChapter={null}
                        onSelect={(n) => navigate({ book: book.nr, chapter: n, verse: 1 }, translationId)}
                      />
                      <p className="hint" style={{ marginTop: 12 }}>
                        Pick a chapter to read it. Use the arrow keys to move between verses.
                      </p>
                    </>
                  ) : chapter === null ? (
                    <p className="empty">
                      {loadingBook ? (
                        <>
                          <span className="spinner" /> Loading&hellip;
                        </>
                      ) : bookUnavailable || chapterTotal === 0 ? (
                        <>
                          {book.name} is not included in the selected version.
                          <br />
                          Pick a complete version to read it.
                        </>
                      ) : bookFailed ? (
                        <>
                          This book could not be loaded.
                          <br />
                          Check your connection, then try again.
                        </>
                      ) : (
                        <>
                          Chapter {route.chapter} is not in this version.
                          <br />
                          It has {chapterTotal} {chapterTotal === 1 ? 'chapter' : 'chapters'}.
                        </>
                      )}
                    </p>
                  ) : (
                    <>
                      <ChapterGrid
                        book={book}
                        translation={meta}
                        selectedChapter={route.chapter}
                        onSelect={(n) => navigate({ book: book.nr, chapter: n, verse: 1 }, translationId)}
                      />
                      <div style={{ marginTop: 16 }}>
                        <VerseList
                          chapter={chapter}
                          selectedVerse={selectedRef?.verse ?? null}
                          onSelect={(verse) =>
                            openRef({ book: book.nr, chapter: chapter.chapter, verse })
                          }
                        />
                      </div>
                    </>
                  )}
                </>
              )}

              {book === null && (
                <div className="empty">
                  <p>Welcome. Pick a book on the left, or search for a word.</p>
                  <p style={{ marginTop: 8 }}>
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => openRef(HOME)}>
                      Open John 3:16
                    </button>
                  </p>
                </div>
              )}
            </>
          )}
        </main>

        <ComparePane
          selected={selectedRef}
          translationId={translationId}
          translations={translations}
          onSelectTranslation={selectTranslation}
          open={compareOpen}
        />
      </div>

      {toast !== null && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  )
}

function currentRef(route: { book: number | null; chapter: number | null; verse: number | null }, _: null): Reference | null {
  if (route.book === null) return null
  return { book: route.book, chapter: route.chapter ?? 0, verse: route.verse ?? 0 }
}

/** Tracks the OS colour scheme so "Auto" theme follows it live. */
function useSystemTheme(theme: Settings['theme']): 'light' | 'dark' {
  const prefersDark = useSyncExternalStore(
    useCallback((onChange: () => void) => {
      const media = window.matchMedia('(prefers-color-scheme: dark)')
      media.addEventListener('change', onChange)
      return () => media.removeEventListener('change', onChange)
    }, []),
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
    () => false,
  )
  if (theme === 'system') return prefersDark ? 'dark' : 'light'
  return theme
}