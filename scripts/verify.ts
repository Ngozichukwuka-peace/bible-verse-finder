/**
 * Verifies the search and routing logic against the real generated data.
 *
 *   node --experimental-strip-types scripts/verify.ts
 *
 * Runs the actual modules the app imports, so it catches mistakes that a type
 * check cannot: wrong ranking, filters that do not apply, hash links that do
 * not round-trip.
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { searchCorpus, parseTerms, mergeMarks } from '../src/lib/searchCore.ts'
import { parseHash, buildHash, resolveBookNr } from '../src/lib/deepLink.ts'
import { bookByNr } from '../src/data/books.generated.ts'
import { toggleBookmark } from '../src/lib/storage.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BIBLE = join(ROOT, 'public', 'bible')

let passed = 0
let failed = 0

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1
    console.log(`  ok   ${name}`)
  } else {
    failed += 1
    console.log(`  FAIL ${name}${detail ? ` -> ${detail}` : ''}`)
  }
}

function loadCorpus(id) {
  const texts = readFileSync(join(BIBLE, id, 'corpus.txt'), 'utf8').split('\u0001')
  return {
    translationId: id,
    texts,
    lower: texts.map((t) => t.toLowerCase()),
    addresses: readFileSync(join(BIBLE, id, 'addresses.txt'), 'utf8').split('\n'),
  }
}

const ALL = { testament: 'ALL', books: [] }

console.log('\nsearch: term parsing')
check('bare words split on whitespace', parseTerms('faith hope').length === 2)
check('quoted text becomes one phrase', parseTerms('"faith, hope"').length === 1)
check('phrase and word combine', parseTerms('"faith, hope" charity').length === 2)
check('commas separate words', parseTerms('faith,hope').length === 2)
check('empty query yields no terms', parseTerms('   ').length === 0)

console.log('\nsearch: mark merging')
check('adjacent marks merge', JSON.stringify(mergeMarks([[0, 3], [3, 6]])) === '[[0,6]]')
check('distant marks stay split', mergeMarks([[0, 3], [9, 12]]).length === 2)

console.log('\nsearch: KJV')
const kjv = loadCorpus('kjv')
check('corpus loaded', kjv.texts.length > 30000, `${kjv.texts.length} verses`)

const faith = searchCorpus(kjv, 'faith', ALL, 20)
check('faith matches every verse containing it', faith.total === 338, `${faith.total} hits`)
check('every hit carries highlights', faith.hits.every((h) => h.highlights.length > 0))
const highlightSound =
  faith.hits.every((h) => h.highlights.every(([s, e]) => h.text.slice(s, e).toLowerCase() === 'faith'))
check('highlights point at the matched text', highlightSound)

const john316 = kjv.texts[kjv.addresses.indexOf('43:3:16')]
check('John 3:16 text intact', john316.startsWith('For God so loved the world'), john316?.slice(0, 40))

// Matching is by substring so "faith" also finds "faithful", but whole-word
// matches must rank first.
const topFaith = searchCorpus(kjv, 'faith', ALL, 1).hits[0]
check('top hit for "faith" is a whole-word match', /\bfaith\b/i.test(topFaith.text), topFaith.text.slice(0, 60))

const both = searchCorpus(kjv, 'faith hope', ALL, 400)
check('two words are ANDed', both.total < faith.total, `${both.total} < ${faith.total}`)
const andSound =
  both.hits.every((h) => /faith/i.test(h.text) && /hope/i.test(h.text))
check('every two-word hit contains both words', andSound)

const phrase = searchCorpus(kjv, '"so loved the world"', ALL, 50)
check('exact phrase finds John 3:16', phrase.hits.some((h) => h.ref.book === 43 && h.ref.chapter === 3 && h.ref.verse === 16))
const phraseSound = phrase.hits.every((h) => /so loved the world/i.test(h.text))
check('phrase hits contain the exact phrase', phraseSound)

const nt = searchCorpus(kjv, 'faith', { testament: 'NT', books: [] }, 400)
check('NT filter removes OT hits', nt.hits.every((h) => h.ref.book >= 40))
check('NT filter reduces the count', nt.total < faith.total)

const johnOnly = searchCorpus(kjv, 'faith', { testament: 'ALL', books: [43] }, 400)
check('book filter only returns that book', johnOnly.hits.every((h) => h.ref.book === 43))
const johnFaith = kjv.texts.filter((_, i) => kjv.addresses[i]?.startsWith('43:') && /faith/i.test(kjv.texts[i]))
check('book filter count matches a manual scan', johnOnly.total === johnFaith.length, `${johnOnly.total} vs ${johnFaith.length}`)

const truncated = searchCorpus(kjv, 'god', ALL, 10)
check('limit truncates and flags it', truncated.hits.length === 10 && truncated.truncated === true)
const unlimited = searchCorpus(kjv, 'god', ALL, 10000)
check('total is independent of limit', truncated.total === unlimited.total)

const started = performance.now()
searchCorpus(kjv, 'compassion', ALL, 100)
const ms = performance.now() - started
check('a full scan stays under 400ms', ms < 400, `${ms.toFixed(0)}ms`)

console.log('\nsearch: other versions')
for (const id of ['web', 'asv', 'ylt', 'douayrheims', 'weymouth']) {
  const c = loadCorpus(id)
  const r = searchCorpus(c, 'faith', ALL, 5)
  check(`${id} searches`, r.total > 0, `${r.total} hits, ${c.texts.length} verses`)
}
const weymouth = loadCorpus('weymouth')
const weymouthSearch = searchCorpus(weymouth, 'faith', ALL, 500)
check('Weymouth searches', weymouthSearch.total > 0, `${weymouthSearch.total} hits`)
check(
  'Weymouth has no OT books',
  weymouthSearch.hits.every((h) => h.ref.book >= 40),
)

console.log('\nrouting: book name resolution')
for (const [token, expected] of [
  ['John', 43], ['john', 43], ['JN', 43], ['1 John', 62], ['1jn', 62], ['1jn', 62],
  ['Gen', 1], ['Ps', 19], ['Rev', 66], ['Psalms', 19], ['Song of Solomon', 22],
  ['song-of-solomon', 22], ['song_of_solomon', 22], ['phil', 50],
]) {
  check(`"${token}" -> book ${expected}`, resolveBookNr(token) === expected, `got ${resolveBookNr(token)}`)
}
check('nonsense returns null', resolveBookNr('zzzz') === null)
check('empty returns null', resolveBookNr('') === null)

console.log('\nrouting: hash round trip')
for (const [hash, expected] of [
  ['#/john/3/16?tr=kjv', { book: 43, chapter: 3, verse: 16, translation: 'kjv' }],
  ['#/1-john/5/1?tr=web', { book: 62, chapter: 5, verse: 1, translation: 'web' }],
  ['#/gen/1?tr=kjv', { book: 1, chapter: 1, verse: null, translation: 'kjv' }],
  ['#/psalms?tr=kjv', { book: 19, chapter: null, verse: null, translation: 'kjv' }],
  ['#/', { book: null, chapter: null, verse: null, translation: null }],
]) {
  const got = parseHash(hash)
  check(
    `parse ${hash}`,
    got.book === expected.book && got.chapter === expected.chapter && got.verse === expected.verse && got.translation === expected.translation,
    JSON.stringify(got),
  )
}

check('chapter beyond the last is rejected', parseHash('#/obadiah/3/1').chapter === null)
check('missing translation becomes null', parseHash('#/john/3/16').translation === null)

for (const ref of [
  { book: 43, chapter: 3, verse: 16 },
  { book: 1, chapter: 1, verse: 1 },
  { book: 62, chapter: 5, verse: 1 },
  { book: 66, chapter: 22, verse: 21 },
]) {
  const hash = buildHash(ref, 'kjv')
  const back = parseHash(hash)
  const same = back.book === ref.book && back.chapter === ref.chapter && back.verse === ref.verse
  check(`round trip ${hash}`, same && back.translation === 'kjv', JSON.stringify(back))
}

check('buildHash uses the abbr', buildHash({ book: 43, chapter: 3, verse: 16 }, 'web') === '#/john/3/16?tr=web')

console.log('\ndata integrity')
const meta = JSON.parse(readFileSync(join(BIBLE, 'index.json'), 'utf8'))
check('11 translations listed', meta.translations.length === 11, `${meta.translations.length}`)
check('every translation has a license', meta.translations.every((t) => t.license !== null))
check('every translation has 66 book entries', meta.translations.every((t) => t.books.length === 66))
const kjvMeta = meta.translations.find((t) => t.id === 'kjv')
check('KJV has all 66 books available', kjvMeta.books.every((b) => b.available))
check('Weymouth is flagged partial', meta.translations.find((t) => t.id === 'weymouth').partial === true)
check('KJV is not flagged partial', kjvMeta.partial === false)
check('addresses align with corpus for every version', meta.translations.every((t) => {
  const texts = readFileSync(join(BIBLE, t.id, 'corpus.txt'), 'utf8').split('\u0001')
  const addrs = readFileSync(join(BIBLE, t.id, 'addresses.txt'), 'utf8').split('\n')
  return texts.length === addrs.length && texts.length === t.verseCount
}))
check('books.generated covers 1..66', (() => {
  for (let nr = 1; nr <= 66; nr += 1) if (bookByNr(nr) === undefined) return false
  return true
})())

console.log('\nstorage: bookmark toggling')
const sample = (id) => ({
  id,
  translationId: 'kjv',
  ref: { book: 43, chapter: 3, verse: 16 },
  text: 'For God so loved the world',
  savedAt: 0,
})
const firstSave = toggleBookmark(sample('kjv:43.3.16'), [])
check('a first save adds the bookmark', firstSave.length === 1, `${firstSave.length} entries`)
check('the added entry is the one offered', firstSave[0]?.id === 'kjv:43.3.16')
check(
  'saving the same verse again removes it',
  toggleBookmark(sample('kjv:43.3.16'), firstSave).length === 0,
)
check(
  'a different bookmark survives',
  toggleBookmark(sample('kjv:1.1.1'), firstSave).length === 2,
  `${toggleBookmark(sample('kjv:1.1.1'), firstSave).length} entries`,
)

console.log(`\n${passed} passed, ${failed} failed\n`)
process.exit(failed === 0 ? 0 : 1)