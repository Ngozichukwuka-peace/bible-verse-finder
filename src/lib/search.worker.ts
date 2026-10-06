/// <reference lib="webworker" />
import type { Corpus, SearchRequest, SearchResponse } from '../types.ts'
import { searchCorpus } from './searchCore.ts'

/**
 * Worker shell around searchCore. It holds the corpus so repeated keystrokes
 * reuse the same pre-lowercased arrays, and so a scan never blocks typing.
 */

let corpus: Corpus | null = null

function run(request: SearchRequest): SearchResponse {
  const started = performance.now()
  const empty: SearchResponse = {
    id: request.id,
    total: 0,
    hits: [],
    truncated: false,
    elapsedMs: 0,
    error: null,
  }

  if (corpus === null || corpus.translationId !== request.translationId) {
    return { ...empty, error: 'Search index is still loading.' }
  }

  const { hits, total, truncated } = searchCorpus(corpus, request.query, request.filters, request.limit)
  return { id: request.id, total, hits, truncated, elapsedMs: performance.now() - started, error: null }
}

self.onmessage = (
  event: MessageEvent<SearchRequest | { type: 'load'; corpus: Corpus }>,
): void => {
  const data = event.data
  if ('type' in data) {
    corpus = data.corpus
    return
  }
  self.postMessage(run(data))
}