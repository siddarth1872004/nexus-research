// ============================================================
// NexusResearch -- Gemini API Client
// Streaming + retry + rate-limiting integration
// ============================================================

import { RateLimiter } from '../core/RateLimiter.js';
import { RequestCache } from '../core/RequestCache.js';
import { sleep } from '../utils/helpers.js';
import { Storage } from '../utils/storage.js';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-2.0-flash';

// Singleton rate limiter and cache
const rateLimiter = new RateLimiter({
  maxConcurrent: 3,
  tokensPerMinute: 15,
  burstAllowance: 5,
});

const requestCache = new RequestCache();

/**
 * Priority levels for rate limiter.
 */
export const PRIORITY = {
  COMMAND: 1,    // Director, Strategist
  RESEARCH: 2,   // Scout, Deep Diver, Cross-Ref
  ANALYSIS: 3,   // Pattern, Devil's Advocate, Quantifier, Bias, Fact Check, Synthesizer, etc.
};

/**
 * Make a Gemini API call with full response (non-streaming).
 * Includes rate limiting, caching, and retry.
 *
 * @param {Object} params
 * @param {string} params.systemPrompt   - System instruction for the model
 * @param {Array}  params.messages       - Array of { role: 'user'|'model', text }
 * @param {number} [params.priority=2]   - Rate limiter priority
 * @param {AbortSignal} [params.signal]  - Abort signal
 * @param {boolean} [params.useCache=true]
 * @returns {Promise<string>} Model response text
 */
export async function generate({ systemPrompt, messages, priority = PRIORITY.RESEARCH, signal, useCache = true }) {
  const apiKey = Storage.getApiKey();
  if (!apiKey) throw new Error('API key not configured');

  // Check cache
  const cacheKey = requestCache.makeKey(systemPrompt, messages);
  if (useCache) {
    const cached = requestCache.get(cacheKey);
    if (cached) return cached;

    // Check in-flight dedup
    const inflight = requestCache.getInflight(cacheKey);
    if (inflight) return inflight;
  }

  // Create the request promise
  const requestPromise = _executeWithRetry({ systemPrompt, messages, priority, signal, apiKey });

  if (useCache) {
    requestCache.setInflight(cacheKey, requestPromise);
  }

  try {
    const result = await requestPromise;
    if (useCache) requestCache.set(cacheKey, result);
    return result;
  } catch (err) {
    throw err;
  }
}

/**
 * Make a streaming Gemini API call.
 * Invokes onChunk with partial text as it arrives.
 *
 * @param {Object} params
 * @param {string} params.systemPrompt
 * @param {Array}  params.messages
 * @param {Function} params.onChunk       - Called with (partialText, fullTextSoFar)
 * @param {number} [params.priority=2]
 * @param {AbortSignal} [params.signal]
 * @returns {Promise<string>} Full response text
 */
export async function streamGenerate({ systemPrompt, messages, onChunk, priority = PRIORITY.RESEARCH, signal }) {
  const apiKey = Storage.getApiKey();
  if (!apiKey) throw new Error('API key not configured');

  // Acquire rate limiter slot
  const slot = await rateLimiter.acquire(priority);

  try {
    const url = `${API_BASE}/${DEFAULT_MODEL}:streamGenerateContent?alt=sse&key=${apiKey}`;
    const body = _buildRequestBody(systemPrompt, messages);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new ApiError(response.status, errText);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep incomplete last line

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr || jsonStr === '[DONE]') continue;

        try {
          const data = JSON.parse(jsonStr);
          const chunk = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (chunk) {
            fullText += chunk;
            if (onChunk) onChunk(chunk, fullText);
          }
        } catch {
          // Skip malformed JSON chunks
        }
      }
    }

    return fullText;
  } finally {
    slot.release();
  }
}

/**
 * Validate an API key by making a minimal request.
 * @returns {Promise<boolean>}
 */
export async function validateApiKey(apiKey) {
  try {
    const url = `${API_BASE}/${DEFAULT_MODEL}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Hi' }] }],
        generationConfig: { maxOutputTokens: 5 },
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Get rate limiter stats */
export function getRateLimiterStats() {
  return rateLimiter.stats;
}

/** Get cache stats */
export function getCacheStats() {
  return requestCache.stats;
}

/** Clear cache (on new session) */
export function clearCache() {
  requestCache.clear();
}

/** Cancel all queued requests */
export function cancelAll() {
  rateLimiter.cancelAll();
}

// ---- Internal ----

async function _executeWithRetry({ systemPrompt, messages, priority, signal, apiKey, maxRetries = 3 }) {
  let lastError;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (signal?.aborted) throw new Error('Request aborted');

    const slot = await rateLimiter.acquire(priority);

    try {
      const url = `${API_BASE}/${DEFAULT_MODEL}:generateContent?key=${apiKey}`;
      const body = _buildRequestBody(systemPrompt, messages);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new ApiError(response.status, errText);
      }

      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return text;
    } catch (err) {
      lastError = err;

      if (err instanceof ApiError && err.status === 429) {
        // Rate limited: exponential backoff
        const backoffMs = Math.min(1000 * Math.pow(2, attempt), 16000);
        console.warn(`[Gemini] Rate limited, backing off ${backoffMs}ms (attempt ${attempt + 1})`);
        await sleep(backoffMs);
        continue;
      }

      if (err instanceof ApiError && err.status >= 500) {
        // Server error: retry with backoff
        await sleep(1000 * (attempt + 1));
        continue;
      }

      // Non-retryable error
      throw err;
    } finally {
      slot.release();
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

function _buildRequestBody(systemPrompt, messages) {
  const contents = messages.map(m => ({
    role: m.role === 'model' ? 'model' : 'user',
    parts: [{ text: m.text }],
  }));

  return {
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    contents,
    generationConfig: {
      temperature: 0.7,
      topP: 0.9,
      maxOutputTokens: 4096,
    },
  };
}

class ApiError extends Error {
  constructor(status, body) {
    super(`Gemini API error ${status}: ${body.slice(0, 200)}`);
    this.status = status;
    this.body = body;
  }
}
