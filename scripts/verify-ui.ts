/**
 * Drives a real Chrome against the running app and asserts the UI behaves.
 * Complements scripts/verify.ts, which covers logic but never renders anything.
 *
 *   npm run preview            # in one shell
 *   npm run test:ui            # in another
 */
import CDP from 'chrome-remote-interface'

const URL_BASE = process.env.UI_URL ?? 'http://localhost:4173'

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Waits for a predicate evaluated in the page, or gives up. */
async function waitFor(client, expression, label, timeout = 25000) {
  const deadline = Date.now() + timeout
  for (;;) {
    const { result } = await client.Runtime.evaluate({ expression, returnByValue: true })
    if (result.value) return result.value
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`)
    await sleep(150)
  }
}

// These emit parenthesised expressions. Without the parens, interpolating one
// into a comparison produces `a ?? null === 'x'`, and JS rejects mixing `??`
// with a logical operator without explicit grouping.
/** Types into the search box the way React expects, via the native setter. */
const typeQuery = (value) => `(() => {
  const input = document.querySelector('.search-input');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(input, ${JSON.stringify(value)});
  input.dispatchEvent(new Event('input', { bubbles: true }));
})()`

const text = (sel) =>
  `(document.querySelector(${JSON.stringify(sel)})?.textContent?.trim() ?? null)`
const count = (sel) => `(document.querySelectorAll(${JSON.stringify(sel)}).length)`

async function main() {
  const client = await CDP()
  const { Page, Runtime, Console, Log, Network } = client
  const errors = []

  // Without Page.enable() the loadEventFired event is never emitted, so a
  // navigate-and-wait would block forever.
  await Promise.all([Page.enable(), Runtime.enable(), Log.enable(), Console.enable?.()])

  // Assets are content-hashed, so a stale cache silently tests the previous
  // build. Always fetch fresh.
  await Network.enable()
  await Network.setCacheDisabled({ cacheDisabled: true })

  Log.entryAdded(({ entry }) => {
    // The URL is not in entry.text, and "Failed to load resource" without one
    // is unactionable — it is the only clue to which asset went missing.
    if (entry.level === 'error') errors.push(entry.url ? `${entry.text} @ ${entry.url}` : entry.text)
  })

  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await Runtime.evaluate({
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (exceptionDetails) {
      const detail =
        exceptionDetails.exception?.description ??
        exceptionDetails.exception?.value ??
        exceptionDetails.text
      throw new Error(`in page: ${detail}\n  while evaluating: ${expression.slice(0, 120)}`)
    }
    return result.value
  }

  const goto = async (url) => {
    // Navigating to a URL that differs only by hash is a same-document
    // navigation, which keeps the previous build's JavaScript alive. Bounce
    // through about:blank so every goto is a real load.
    //
    // Waiting on Page.loadEventFired races: the event can fire before we
    // register a handler. Polling readyState is reliable.
    await Page.navigate({ url: 'about:blank' })
    await Page.navigate({ url })
    await waitFor(client, `document.readyState === 'complete'`, `load of ${url}`, 30000)
  }

  console.log('\ninitial load')
  // Start from a clean slate: earlier runs leave bookmarks, theme and a last
  // used version in localStorage, which would leak into these assertions.
  await goto(URL_BASE)
  await evaluate(`localStorage.clear()`)
  await goto(`${URL_BASE}/#/john/3/16?tr=kjv`)
  await waitFor(client, `${text('.verse-text')} !== null`, 'verse text')

  check('renders the verse pane', (await evaluate(count('.verse'))) > 10)
  check(
    'John 3:16 text is shown',
    (await evaluate(text('.verse-selected .verse-text')))?.includes('For God so loved the world'),
    await evaluate(text('.verse-selected .verse-text')),
  )
  check('chapter grid rendered', (await evaluate(count('.chapter-btn'))) === 21)
  check('breadcrumb shows the book', (await evaluate(text('.crumb-book'))) === 'John')

  console.log('\nbrowse flow')
  check(
    'book tab follows the open book (John is NT)',
    (await evaluate(text('.book-tabs .btn-active'))) === 'NT',
    await evaluate(text('.book-tabs .btn-active')),
  )
  await evaluate(`[...document.querySelectorAll('.book-tabs .btn')].find(b=>b.textContent==='OT').click()`)
  await sleep(300)
  check('OT tab lists 39 books', (await evaluate(count('.book-btn'))) === 39)
  await evaluate(`[...document.querySelectorAll('.book-btn')].find(b=>b.textContent.includes('Psalms')).click()`)
  await waitFor(client, `${text('.crumb-book')} === 'Psalms' && ${count('.chapter-btn')} === 150`, 'Psalms to load')
  check('book click switches the reader', (await evaluate(text('.crumb-book'))) === 'Psalms')
  check('Psalms has 150 chapters', (await evaluate(count('.chapter-btn'))) === 150)

  await evaluate(`document.querySelectorAll('.chapter-btn')[22].click()`)
  await waitFor(client, `${count('.verse')} > 0`, 'Psalm 23 verses')
  const psalm23 = await evaluate(text('.verse-list'))
  check('Psalm 23 loaded', psalm23?.includes('my shepherd'), psalm23?.slice(0, 50))
  check('URL tracks the chapter', (await evaluate('location.hash')).startsWith('#/ps/23/1'))

  console.log('\ninstant search')
  await evaluate(typeQuery('shepherd'))
  await waitFor(client, `${count('.result')} > 0`, 'search results', 30000)
  const resultCount = await evaluate(count('.result'))
  check('typing produces results', resultCount > 0, `${resultCount} shown`)
  check('matches are highlighted', (await evaluate(count('.result mark'))) > 0)
  const firstResult = await evaluate(text('.result'))
  check('a real match is shown', firstResult?.includes('shepherd'), firstResult?.slice(0, 60))

  // A one-word phrase matches exactly what the bare word already matches, so
  // it cannot narrow anything. Two words can: every verse with both words,
  // versus only verses where they are adjacent.
  await evaluate(typeQuery('the shepherd'))
  await waitFor(client, `${text('.search-status')} !== null && ${count('.result')} > 0`, 'two-word search', 40000)
  const andCount = await evaluate(count('.result'))
  await evaluate(typeQuery('"the shepherd"'))
  await sleep(600)
  const phraseCount = await evaluate(count('.result'))
  check('exact phrase narrows results', phraseCount > 0 && phraseCount < andCount, `${andCount} AND vs ${phraseCount} phrase`)

  console.log('\nclicking a result opens the verse')
  await evaluate(`document.querySelector('.result').click()`)
  await waitFor(client, `${text('.verse-selected')} !== null`, 'opened verse')
  check('search cleared and reader shown', (await evaluate(`${text('.search-input')} === ''`)) === true)
  check('a verse is selected', (await evaluate(text('.verse-selected .verse-num'))) !== null)

  console.log('\nversion switching')
  await goto(`${URL_BASE}/#/john/3/16?tr=kjv`)
  await waitFor(client, `${text('.verse-selected .verse-text')} !== null`, 'kjv verse')
  await goto(`${URL_BASE}/#/john/3/16?tr=web`)
  await waitFor(client, `${text('.verse-selected .verse-text')}?.includes('loved')`, 'web verse')
  const webText = await evaluate(text('.verse-selected .verse-text'))
  check(
    'WEB differs from KJV',
    webText?.includes('one and only Son') === true && !webText.includes('only begotten Son'),
    webText?.slice(0, 70),
  )
  check('version list highlights WEB', (await evaluate(text('.version-row[aria-pressed="true"] .version-badge'))) === 'WEB')

  console.log('\ncompare pane')
  await waitFor(client, `${count('.compare-item')} === 11`, 'all 11 versions', 40000)
  check('compare lists every version', (await evaluate(count('.compare-item'))) === 11)
  const withText = await evaluate(
    `[...document.querySelectorAll('.compare-item')].filter(e=>e.querySelector('.compare-text')).length`,
  )
  // John sits in both partial versions' New Testaments, so every one of the
  // 11 has this verse. A book outside a partial version is covered below.
  check('every version shows text for John', withText === 11, `${withText} with text`)
  const missing = await evaluate(count('.compare-missing'))
  check('no version is missing John', missing === 0, `${missing} marked missing`)

  console.log('\npartial version handling')
  // Weymouth is New Testament only, so John reads but Genesis cannot.
  await goto(`${URL_BASE}/#/john/3/16?tr=weymouth`)
  await waitFor(client, `${text('.verse-selected .verse-text')} !== null`, 'weymouth john verse')
  check('partial version reads its own books', (await evaluate(text('.crumb-book'))) === 'John')
  await waitFor(
    client,
    `${text('.version-row[aria-pressed="true"] .tag-partial')} !== null`,
    'the PARTIAL tag',
  )
  check('partial version is labelled', true)

  // Its whole Old Testament is disabled in the book list.
  await evaluate(`[...document.querySelectorAll('.book-tabs .btn')].find(b=>b.textContent==='OT').click()`)
  await sleep(300)
  const genesis = `[...document.querySelectorAll('.book-btn')].find(b=>b.textContent.includes('Genesis'))`
  check('books outside the version are disabled', (await evaluate(`${genesis}.disabled`)) === true)
  check('the disabled book explains why', (await evaluate(`${genesis}.title`))?.includes('not included') === true)

  // Opening the book with no chapter shows the chapter grid's notice. The
  // buttons render before the version index arrives, so wait for the notice
  // rather than for the buttons to exist.
  await goto(`${URL_BASE}/#/gen?tr=weymouth`)
  await waitFor(
    client,
    `document.body.textContent.includes('not included in the selected version')`,
    'the chapter grid notice',
  )
  check('chapter grid marks the book missing', (await evaluate(count('.chapter-btn'))) === 50)
  check('chapter grid disables every chapter', (await evaluate(count('.chapter-btn:disabled'))) === 50)
  check(
    'chapter grid says the book is missing',
    (await evaluate(`document.body.textContent.includes('Genesis is not included')`)) === true,
  )

  // Deep linking straight to a chapter must explain itself too, rather than
  // loading forever.
  await goto(`${URL_BASE}/#/gen/1/1?tr=weymouth`)
  await waitFor(
    client,
    `!document.body.innerText.includes('Loading') &&
     document.body.textContent.includes('not included in the selected version')`,
    'the deep-linked missing book notice',
  )
  check('deep link to a missing book explains the limit', true)

  console.log('\nbookmarks and recents')
  await goto(`${URL_BASE}/#/john/3/16?tr=kjv`)
  await waitFor(client, `${text('.verse-selected .verse-text')} !== null`, 'verse for bookmark')
  // The sidebar always has a "Saved" heading, so waiting on that text proves
  // nothing. Wait for the actual button, click it, then wait for storage.
  await waitFor(
    client,
    `[...document.querySelectorAll('.reader-head button')].some(b=>b.textContent.trim()==='Save')`,
    'the Save button',
  )
  const clickResult = await evaluate(`(() => {
    const btn = [...document.querySelectorAll('.reader-head button')].find(b => b.textContent.trim() === 'Save')
    if (!btn) return 'NO-BUTTON'
    btn.click()
    return 'CLICKED'
  })()`)
  check('the Save button was clicked', clickResult === 'CLICKED', clickResult)
  const selectedReady = await evaluate(`(() => {
    const verse = document.querySelector('.verse-selected')
    return verse === null ? 'no-selected-verse' : verse.innerText.slice(0, 30)
  })()`)
  check('a verse is selected to save', selectedReady !== 'no-selected-verse', selectedReady)
  await waitFor(
    client,
    `(JSON.parse(localStorage.getItem('biblevf:bookmarks') || '[]')).length > 0`,
    'the bookmark to reach localStorage',
    8000,
  )
  await waitFor(
    client,
    `[...document.querySelectorAll('.reader-head button')].some(b=>b.textContent.trim()==='Saved')`,
    'the button to read Saved',
  )
  check(
    'bookmark persisted to localStorage',
    (await evaluate(`JSON.parse(localStorage.getItem('biblevf:bookmarks') || '[]').length`)) === 1,
  )
  check(
    'the button now reads Saved',
    (await evaluate(
      `[...document.querySelectorAll('.reader-head button')].some(b=>b.textContent.trim()==='Saved')`,
    )) === true,
  )
  check('bookmark is shown in the sidebar', (await evaluate(
    `!document.body.textContent.includes('Nothing saved yet')`,
  )) === true)

  console.log('\ntheme')
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Dark').click()`)
  await sleep(250)
  check('dark theme applied', (await evaluate('document.documentElement.dataset.theme')) === 'dark')
  check('theme persisted', (await evaluate(`JSON.parse(localStorage.getItem('biblevf:settings')).theme`)) === 'dark')

  console.log('\nverse of the day')
  // The card fetches a whole book payload, so on a real network it lands a
  // beat after everything else. Waiting keeps the assertion about the feature
  // rather than about the round trip.
  await waitFor(client, `${text('.votd-text')} !== null`, 'the daily verse to load')
  check('a daily verse is offered', (await evaluate(text('.votd-text'))) !== null)
  check('with a reference', (await evaluate(text('.votd-ref')))?.includes(':'))

  console.log('\nkeyboard navigation')
  await goto(`${URL_BASE}/#/john/3/16?tr=kjv`)
  await waitFor(client, `${text('.verse-selected .verse-num')} === '16'`, 'verse 16')
  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}))`)
  await sleep(300)
  check('arrow key advances a verse', (await evaluate(text('.verse-selected .verse-num'))) === '17')
  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}))`)
  await sleep(300)
  check('arrow key goes back', (await evaluate(text('.verse-selected .verse-num'))) === '16')

  console.log('\nconsole cleanliness')
  const noisy = errors.filter((e) => !/favicon|DevTools/i.test(e))
  check('no console errors', noisy.length === 0, noisy.slice(0, 3).join(' | '))

  await client.close()
  console.log(`\n${passed} passed, ${failed} failed\n`)
  process.exit(failed === 0 ? 0 : 1)
}

main()
  .catch((error) => {
    console.error(`\nUI check crashed: ${error.message}\n`)
    process.exit(1)
  })
  .finally(() => process.exit(process.exitCode ?? 0))