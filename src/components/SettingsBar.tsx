import type { TranslationMeta } from '../types.ts'
import type { Settings } from '../lib/storage.ts'
import { englishVoices, speechSupported } from '../lib/speech.ts'

interface SettingsBarProps {
  settings: Settings
  onSettings: (settings: Settings) => void
  translation: TranslationMeta | undefined
  translations: TranslationMeta[]
  voiceURI: string | null
  onVoice: (voiceURI: string | null) => void
  creditsOpen: boolean
  onCredits: (open: boolean) => void
}

const FONT_STEPS = [15, 16, 17, 18, 20, 22, 25, 28]

export function SettingsBar({
  settings,
  onSettings,
  translation,
  translations,
  voiceURI,
  onVoice,
  creditsOpen,
  onCredits,
}: SettingsBarProps) {
  const fontIndex = Math.max(0, FONT_STEPS.indexOf(settings.fontSize))

  return (
    <>
      <div className="control-row">
        <div className="testament-tabs" role="group" aria-label="Theme">
          {(['light', 'dark', 'system'] as const).map((theme) => (
            <button
              key={theme}
              type="button"
              className={`btn btn-sm${settings.theme === theme ? ' btn-active' : ''}`}
              onClick={() => onSettings({ ...settings, theme })}
              aria-pressed={settings.theme === theme}
            >
              {theme === 'light' ? 'Light' : theme === 'dark' ? 'Dark' : 'Auto'}
            </button>
          ))}
        </div>

        <label htmlFor="font-size">Text</label>
        <input
          id="font-size"
          type="range"
          min={0}
          max={FONT_STEPS.length - 1}
          value={fontIndex}
          onChange={(e) =>
            onSettings({ ...settings, fontSize: FONT_STEPS[Number(e.target.value)] ?? 18 })
          }
          style={{ width: 84 }}
          aria-label="Text size"
        />

        <button
          type="button"
          className={`btn btn-sm${settings.fontFamily === 'sans' ? ' btn-active' : ''}`}
          onClick={() =>
            onSettings({ ...settings, fontFamily: settings.fontFamily === 'serif' ? 'sans' : 'serif' })
          }
          title="Switch between serif and sans-serif"
          aria-pressed={settings.fontFamily === 'sans'}
        >
          {settings.fontFamily === 'serif' ? 'Serif' : 'Sans'}
        </button>

        <button type="button" className="btn btn-sm" onClick={() => onCredits(true)}>
          About
        </button>
      </div>

      {creditsOpen && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) onCredits(false)
          }}
        >
          <div className="dialog-body" role="dialog" aria-modal="true" aria-label="About">
            <button
              type="button"
              className="btn btn-sm dialog-close"
              onClick={() => onCredits(false)}
              autoFocus
            >
              Close
            </button>
            <h2>Bible Verse Finder</h2>
            <p>
              {translations.length} public-domain translations, fetched once at build time from
              api.getbible.net and served from this site. The app makes no network requests at
              runtime, so it keeps working offline.
            </p>

            <h3>Read aloud</h3>
            {speechSupported() ? (
              <>
                <p className="hint">
                  Choose a voice here, then use Read in the reader toolbar. Your choice is
                  remembered in this browser only.
                </p>
                <select
                  className="field"
                  value={voiceURI ?? ''}
                  aria-label="Speech voice"
                  onChange={(e) => onVoice(e.target.value === '' ? null : e.target.value)}
                >
                  <option value="">Default voice</option>
                  {englishVoices().map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {v.name} ({v.lang})
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <p className="hint">
                This browser does not expose the Web Speech API, so read-aloud is unavailable.
              </p>
            )}

            <h3>Selected translation</h3>
            {translation === undefined ? (
              <p className="hint">Loading&hellip;</p>
            ) : (
              <>
                <p>
                  <strong>{translation.name}</strong> ({translation.short}) &middot;{' '}
                  {translation.verseCount.toLocaleString()} verses &middot;{' '}
                  {translation.books.filter((b) => b.available).length}/66 books
                </p>
                <p className="hint">
                  License: {translation.license ?? 'unknown'}
                  {translation.version !== null && ` · version ${translation.version}`}
                  {translation.partial && ' · partial translation'}
                </p>
                {translation.about !== null && <p className="hint">{translation.about.slice(0, 1500)}</p>}
              </>
            )}

            <h3>Every translation</h3>
            {translations.map((t) => (
              <p key={t.id} className="hint">
                <strong>{t.name}</strong> — {t.verseCount.toLocaleString()} verses,{' '}
                {t.license ?? 'unknown license'}
                {t.partial ? ', partial' : ''}
              </p>
            ))}
          </div>
        </div>
      )}
    </>
  )
}