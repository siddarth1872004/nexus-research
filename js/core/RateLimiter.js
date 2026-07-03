// ============================================================
// NexusResearch -- RateLimiter
// Semaphore + token-bucket hybrid with priority queuing
// ============================================================

/**
 * Controls concurrent API request volume.
 * - Semaphore: limits max concurrent requests
 * - Token bucket: limits requests per time window
 * - Priority queue: higher-priority requests jump the line
 *
 * Priority levels: 1 (highest / command tier) to 3 (lowest / analysis tier)
 */

export class RateLimiter {
  /**
   * @param {Object} options
   * @param {number} [options.maxConcurrent=3]      - Max simultaneous requests
   * @param {number} [options.tokensPerMinute=15]    - Max requests per minute
   * @param {number} [options.burstAllowance=5]      - Extra burst tokens
   */
  constructor({ maxConcurrent = 3, tokensPerMinute = 15, burstAllowance = 5 } = {}) {
    this._maxConcurrent = maxConcurrent;
    this._activeCount = 0;

    // Token bucket
    this._maxTokens = tokensPerMinute + burstAllowance;
    this._tokens = this._maxTokens;
    this._refillRate = tokensPerMinute / 60000; // tokens per ms
    this._lastRefill = Date.now();

    // Priority queue: array of { priority, resolve, reject }
    this._queue = [];
  }

  /**
   * Acquire a slot. Returns a promise that resolves when a slot is available.
   * The returned object has a `release` function that MUST be called when done.
   * @param {number} [priority=2] - 1 (high), 2 (medium), 3 (low)
   * @returns {Promise<{release: Function}>}
   */
  acquire(priority = 2) {
    return new Promise((resolve, reject) => {
      const request = { priority, resolve, reject };
      this._queue.push(request);
      // Sort by priority (lower number = higher priority)
      this._queue.sort((a, b) => a.priority - b.priority);
      this._tryProcess();
    });
  }

  /**
   * Try to process queued requests.
   */
  _tryProcess() {
    this._refillTokens();

    while (this._queue.length > 0 && this._activeCount < this._maxConcurrent && this._tokens >= 1) {
      const request = this._queue.shift();
      this._activeCount++;
      this._tokens--;

      const release = () => {
        this._activeCount = Math.max(0, this._activeCount - 1);
        // Schedule next processing on next microtask
        queueMicrotask(() => this._tryProcess());
      };

      request.resolve({ release });
    }

    // If we have queued items but no tokens, schedule retry when tokens refill
    if (this._queue.length > 0 && this._tokens < 1) {
      const msUntilToken = Math.ceil(1 / this._refillRate);
      setTimeout(() => this._tryProcess(), msUntilToken);
    }
  }

  /**
   * Refill tokens based on elapsed time.
   */
  _refillTokens() {
    const now = Date.now();
    const elapsed = now - this._lastRefill;
    const newTokens = elapsed * this._refillRate;
    this._tokens = Math.min(this._maxTokens, this._tokens + newTokens);
    this._lastRefill = now;
  }

  /**
   * Cancel all queued requests (e.g., on abort).
   */
  cancelAll() {
    const queued = this._queue.splice(0);
    for (const req of queued) {
      req.reject(new Error('Rate limiter cancelled'));
    }
  }

  /** Current stats */
  get stats() {
    return {
      active: this._activeCount,
      queued: this._queue.length,
      tokens: Math.floor(this._tokens),
      maxConcurrent: this._maxConcurrent,
    };
  }
}
