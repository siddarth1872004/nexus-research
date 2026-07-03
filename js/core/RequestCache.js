// ============================================================
// NexusResearch -- RequestCache
// Hash-based request deduplication and response caching
// ============================================================

import { hashString } from '../utils/helpers.js';

export class RequestCache {
  constructor() {
    this._cache = new Map();       // hash -> { response, timestamp }
    this._inflight = new Map();    // hash -> Promise
    this._hits = 0;
    this._misses = 0;
  }

  /**
   * Generate a cache key from system prompt and messages.
   */
  makeKey(systemPrompt, messages) {
    const raw = systemPrompt + '|' + JSON.stringify(messages);
    return hashString(raw);
  }

  /**
   * Check if a response is cached.
   */
  has(key) {
    return this._cache.has(key);
  }

  /**
   * Get a cached response.
   */
  get(key) {
    const entry = this._cache.get(key);
    if (entry) {
      this._hits++;
      return entry.response;
    }
    this._misses++;
    return null;
  }

  /**
   * Store a response in the cache.
   */
  set(key, response) {
    this._cache.set(key, { response, timestamp: Date.now() });
  }

  /**
   * Check if an identical request is already in-flight.
   * If so, return the existing promise. Otherwise return null.
   */
  getInflight(key) {
    return this._inflight.get(key) || null;
  }

  /**
   * Register an in-flight request.
   */
  setInflight(key, promise) {
    this._inflight.set(key, promise);
    // Auto-cleanup when promise settles
    promise.finally(() => this._inflight.delete(key));
  }

  /** Clear the cache (on new research session) */
  clear() {
    this._cache.clear();
    this._inflight.clear();
    this._hits = 0;
    this._misses = 0;
  }

  /** Cache stats */
  get stats() {
    return {
      entries: this._cache.size,
      inflight: this._inflight.size,
      hits: this._hits,
      misses: this._misses,
      hitRate: this._hits + this._misses > 0
        ? Math.round((this._hits / (this._hits + this._misses)) * 100)
        : 0,
    };
  }
}
