import type { Corpus, SearchFilters, SearchRequest, SearchResponse } from '../types.ts'
import { loadCorpus } from './loader.ts'

/**
 * Owns the search worker and the debounce. Queries are cancelled by id, so a
 * fast typist never sees results from a stale keystroke land after fresh ones.
 */

type Pending = { resolve: (r: SearchResponse) => void; timer: ReturnType<typeof setTimeout> }

const DEBOUNCE_MS = 120

export class SearchClient {
  private worker: Worker | null = null
  private ready: Promise<void> | null = null
  private readyFor: string | null = null
  private pending = new Map<number, Pending>()
  private nextId = 1
  private lastRequest: SearchRequest | null = null

  async ensureIndex(translationId: string): Promise<void> {
    if (this.readyFor === translationId && this.ready) return this.ready
    if (this.worker === null) {
      this.worker = new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' })
      this.worker.onmessage = (event: MessageEvent<SearchResponse>) => {
        const entry = this.pending.get(event.data.id)
        if (!entry) return
        clearTimeout(entry.timer)
        this.pending.delete(event.data.id)
        entry.resolve(event.data)
      }
    }
    const worker = this.worker
    const p = loadCorpus(translationId).then((corpus) => {
      worker.postMessage({ type: 'load', corpus } satisfies { type: 'load'; corpus: Corpus })
    })
    this.ready = p
    this.readyFor = translationId
    return p
  }

  get isIndexing(): boolean {
    return this.ready === null
  }

  /** Runs a query after the debounce window, or re-runs the last one now. */
  search(translationId: string, query: string, filters: SearchFilters, limit = 120): Promise<SearchResponse> {
    const request: SearchRequest = { id: this.nextId++, translationId, query, filters, limit }
    this.lastRequest = request
    return this.dispatch(request, DEBOUNCE_MS)
  }

  /** Re-runs the previous query with no debounce, e.g. when a filter changes. */
  rerun(translationId: string, filters: SearchFilters): Promise<SearchResponse> {
    if (this.lastRequest === null) {
      return Promise.resolve<SearchResponse>({
        id: -1,
        total: 0,
        hits: [],
        truncated: false,
        elapsedMs: 0,
        error: null,
      })
    }
    const request: SearchRequest = { ...this.lastRequest, id: this.nextId++, translationId, filters }
    this.lastRequest = request
    return this.dispatch(request, 0)
  }

  private dispatch(request: SearchRequest, delay: number): Promise<SearchResponse> {
    const worker = this.worker
    if (worker === null) {
      return Promise.resolve<SearchResponse>({
        id: request.id,
        total: 0,
        hits: [],
        truncated: false,
        elapsedMs: 0,
        error: 'Search is unavailable.',
      })
    }
    return new Promise<SearchResponse>((resolve) => {
      // The entry must stay registered until the worker actually answers:
      // onmessage looks the id up to resolve. Dropping it here would leave the
      // promise pending forever and the UI spinning.
      const timer = setTimeout(() => {
        worker.postMessage(request)
      }, delay)
      this.pending.set(request.id, { resolve, timer })
    })
  }

  dispose(): void {
    for (const entry of this.pending.values()) clearTimeout(entry.timer)
    this.pending.clear()
    this.worker?.terminate()
    this.worker = null
    this.ready = null
    this.readyFor = null
  }
}
