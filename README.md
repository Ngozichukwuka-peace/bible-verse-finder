# Bible Verse Finder

An instant-search Bible reader. Type a word and matching verses appear as you
type; or click through all 66 books, every chapter and every verse. Eleven
public-domain translations, switchable and comparable side by side.

Runs entirely offline. The scripture is fetched once at build time and served
from the site, so the app makes no network requests at runtime.

## Getting started

```bash
npm install
npm run build:bible   # downloads the translations (~90 MB, one time, cached)
npm run dev
```

`npm run build:bible` is the slow part: it pulls 11 complete Bibles from
api.getbible.net and writes them out as static JSON. Downloads are cached in
`.cache/`, so a second run only regenerates files. Re-download everything with
`npm run build:bible -- --force`.

To do it in one step: `npm run setup`.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on port 5173 |
| `npm run build` | Typecheck, then build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm run test` | 71 assertions over search, routing, bookmarks and data integrity |
| `npm run lint` | ESLint, including the React Compiler rules |
| `npm run typecheck` | `tsc` with strict settings |
| `npm run check` | Typecheck, lint, `npm run test` and a production build |
| `npm run build:bible` | Download and generate the scripture data |
| `npm run test:ui` | 41 real-browser checks (needs the servers below) |
| `npm run deploy` | Build and ship to Vercel (`vercel deploy --prod`) |

### Browser checks

`npm run test:ui` drives the built app through headless Chrome over the
DevTools protocol: search, navigation, version switching, compare,
partial-version limits, bookmarks, theme and keyboard handling.

It needs two things already running:

```bash
npm run build
npm run preview -- --port 4173          # terminal 1
chrome --headless=new --remote-debugging-port=9222 about:blank   # terminal 2
npm run test:ui                          # terminal 3
```

It is deliberately outside `npm run check`: that suite must stay runnable on a
machine with no browser installed. It fails the run if the page logs any
console error.

Point it at a deployment instead of the local preview with `UI_URL`:

```bash
UI_URL=https://<site> npm run test:ui
```

## Hosting

The site is static files with hash-based routing, so it needs no rewrite rules
or server functions. `vercel.json` builds it the way a fresh clone would —
`npm run build:bible` regenerates the scripture, then `npm run build`
typechecks and bundles it — and `.vercelignore` keeps `public/bible/` (110 MB)
out of the upload, since it is rebuilt on the build machine instead.

```bash
npm run deploy        # vercel deploy --prod
```

## Using it

**Search** — bare words are ANDed, so `faith hope` finds verses containing both.
Wrap words in double quotes for an exact phrase: `"so loved the world"`.
Matching is by substring, so `faith` also finds `faithful`, but whole-word
matches always rank first. The Filters control narrows to a testament or a
single book.

**Browse** — pick a book in the sidebar, then a chapter, then a verse. Chapters
a translation does not contain are disabled rather than hidden.

**Compare** — select any verse to see it in every installed version at once, or
switch the whole app to that version with one click. Versions that omit a book
say so explicitly.

**Deep links** — the URL always reflects what you are reading, so copying it or
sharing sends someone to the same verse in the same version:

```
#/john/3/16?tr=web
```

**Keyboard** — `/` focuses search, `j`/`k` or the arrow keys move between
verses, `b` saves, `c` copies, `Esc` closes dialogs.

**Saved and recent** — bookmarks and recently viewed verses persist in
`localStorage`, along with theme, text size and voice choice.

**Read aloud** — uses the browser's Web Speech API. No dependency, but it is
unavailable in some browsers, so the button hides itself when unsupported.

## Translations

| id | Name | Books |
| --- | --- | --- |
| `kjv` | King James Version | 66/66 |
| `web` | World English Bible | 66/66 |
| `asv` | American Standard Version | 66/66 |
| `ylt` | Young's Literal Translation | 66/66 |
| `basicenglish` | Basic English Bible | 66/66 |
| `douayrheims` | Douay-Rheims (1899 American Edition) | 66/66 |
| `wb` | Webster's Bible | 66/66 |
| `wycliffe` | Wycliffe Bible (c. 1395) | 66/66 |
| `akjv` | American King James Version | 66/66 |
| `tyndale` | Tyndale Bible (1525/1530) | 33/66, marked partial |
| `weymouth` | Weymouth New Testament | 27/66, marked partial |

Every version is public domain or freely redistributable. Each one's own
license and attribution come from the upstream API and are shown in the About
dialog, which lists all eleven.

## How it is put together

### Data pipeline

`scripts/build-bible.mjs` fetches each translation once and writes, per version
into `public/bible/<id>/`:

| File | Contents | Used for |
| --- | --- | --- |
| `index.json` | Metadata, license, per-book chapter counts | Version list, availability |
| `book-<nr>.json` | One book's text | Lazy-loaded when a book opens |
| `corpus.txt` | Every verse joined by `U+0001` | Search |
| `addresses.txt` | `book:chapter:verse` per corpus entry | Mapping hits back to references |

Both `public/` copies and `.gz` siblings are generated, and both ship in the
build: the app prefers the `.gz` sibling when the browser supports
`DecompressionStream`, which matters because Vite's dev server does not
compress `public/`. `fetchText` only hands bytes to the decompressor when they
really are gzip, and rejects an HTML response, so a host that serves the file
already decompressed — or answers a missing one with the SPA shell — falls
through to the plain asset instead.

`scripts/books.mjs` is the single source of truth for the 66 books. It also
generates `src/data/books.generated.ts`, so the app and the pipeline can never
disagree about a chapter count.

### Search

Full-text search runs in a Web Worker (`src/lib/search.worker.ts`) over a
corpus pre-lowercased once per version, so a query is just a set of substring
scans. A full-Bible scan is roughly 20–50 ms and never blocks typing.

The matching logic lives in `src/lib/searchCore.ts`, free of worker plumbing so
`npm run test` can exercise it directly in Node against the real corpus.

Queries are debounced at 120 ms and cancelled by id, so a fast typist never sees
a stale keystroke's results land after fresher ones.

### State

Effects subscribe to things; they do not clear state. Async results are stored
alongside the key that produced them and derived during render, so switching
version, chapter or search filter can never briefly show the previous one's
data. See `metaCache`, `payloadCache` and `searchCache` in `src/App.tsx`.

Failures are outcomes too: a version's index says which books it ships, so the
reader never requests one that is missing, and a rejected book load becomes an
explanation ("Genesis is not included in the selected version") rather than a
spinner that never stops.

Routing is hand-rolled on `location.hash` to keep the dependency list at React
and nothing else.

### Dependencies

React and React DOM only. Dark mode is CSS custom properties, routing is ~60
lines of hash parsing, and read-aloud is the Web Speech API.

## Notes and limits

- `public/bible/` is 110 MB on disk (~86 MB of text plus ~24.6 MB of `.gz`
  siblings) and is gitignored. It is reproducible, so committing it would bloat
  the repo for no benefit. A build output is ~114 MB with the `.gz` copies
  included; each version loads on demand, so a visitor only downloads the one
  they open plus the one they search.
- Only one version's corpus is in memory at a time, plus any book files already
  visited. Search therefore always runs within the currently selected version,
  not across all of them. Cross-version *reading* is what the Compare pane is
  for.
- Verse numbering follows each translation's own versification. DRB has more
  verses (31,432) than KJV (31,102) because of its additions, so a verse number
  in one version does not always mean the same thing in another.
- Search is case-insensitive and accent-sensitive. "cafe" will not match "café".