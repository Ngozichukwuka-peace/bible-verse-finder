import type { Bookmark, RecentEntry, Reference, Theme } from '../types.ts'

/**
 * All persistence lives here. Every read is defensive: a corrupt or
 * hand-edited value must not take the app down.
 */

const PREFIX = 'biblevf:'

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // Private mode or a full quota. Nothing useful to do about it.
  }
}

export function refKey(translationId: string, ref: Reference): string {
  return `${translationId}:${ref.book}.${ref.chapter}.${ref.verse}`
}

/* ---------------------------------------------------------------- settings */

export interface Settings {
  theme: Theme
  fontSize: number
  fontFamily: 'serif' | 'sans'
  searchInAllVersions: boolean
  lastTranslation: string | null
}

const SETTINGS_DEFAULT: Settings = {
  theme: 'system',
  fontSize: 18,
  fontFamily: 'serif',
  searchInAllVersions: false,
  lastTranslation: null,
}

export function loadSettings(): Settings {
  return { ...SETTINGS_DEFAULT, ...read<Partial<Settings>>('settings', {}) }
}

export function saveSettings(settings: Settings): void {
  write('settings', settings)
}

/* ---------------------------------------------------------------- bookmarks */

export function loadBookmarks(): Bookmark[] {
  const list = read<Bookmark[]>('bookmarks', [])
  return Array.isArray(list) ? list.filter((b) => b && typeof b.id === 'string') : []
}

export function toggleBookmark(bookmark: Bookmark, existing: Bookmark[]): Bookmark[] {
  const without = existing.filter((b) => b.id !== bookmark.id)
  // Filtering it out means it was already saved, so this click turns it off.
  if (without.length !== existing.length) {
    write('bookmarks', without)
    return without
  }
  const next = [bookmark, ...without]
  write('bookmarks', next)
  return next
}

export function removeBookmark(id: string, existing: Bookmark[]): Bookmark[] {
  const next = existing.filter((b) => b.id !== id)
  write('bookmarks', next)
  return next
}

/* ------------------------------------------------------------------ recents */

const RECENT_LIMIT = 12

export function loadRecents(): RecentEntry[] {
  const list = read<RecentEntry[]>('recents', [])
  return Array.isArray(list) ? list.filter((r) => r && typeof r.id === 'string') : []
}

export function pushRecent(translationId: string, ref: Reference): RecentEntry[] {
  const id = refKey(translationId, ref)
  const entry: RecentEntry = { id, translationId, ref, at: Date.now() }
  const next = [entry, ...loadRecents().filter((r) => r.id !== id)].slice(0, RECENT_LIMIT)
  write('recents', next)
  return next
}

export function clearRecents(): RecentEntry[] {
  write('recents', [])
  return []
}

/* ------------------------------------------------------------------- theme */

export function systemPrefersDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

export function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'system') return systemPrefersDark() ? 'dark' : 'light'
  return theme
}
