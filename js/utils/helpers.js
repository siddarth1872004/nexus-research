// ============================================================
// NexusResearch -- Helpers
// UUID, timestamps, sanitization, deep clone, hashing
// ============================================================

let _idCounter = 0;

/**
 * Generate a compact unique ID (faster than crypto.randomUUID for non-crypto use).
 * Format: base36 timestamp + counter
 */
export function uid() {
  return Date.now().toString(36) + (++_idCounter).toString(36);
}

/**
 * Format a timestamp as HH:MM:SS
 */
export function formatTime(ts = Date.now()) {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour12: false });
}

/**
 * Format elapsed time as "Xs" or "Xm Ys"
 */
export function formatElapsed(startMs, endMs = Date.now()) {
  const sec = Math.round((endMs - startMs) / 1000);
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

/**
 * Basic HTML entity escaping for untrusted text
 */
const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ESC_MAP[c]);
}

/**
 * Truncate text to maxLen, appending "..." if truncated
 */
export function truncate(str, maxLen = 120) {
  if (!str || str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

/**
 * Structured clone with fallback
 */
export function deepClone(obj) {
  try {
    return structuredClone(obj);
  } catch {
    return JSON.parse(JSON.stringify(obj));
  }
}

/**
 * Debounce a function
 */
export function debounce(fn, ms = 100) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

/**
 * Throttle a function to at most once per `ms`
 */
export function throttle(fn, ms = 16) {
  let last = 0;
  let timer;
  return function (...args) {
    const now = Date.now();
    const remaining = ms - (now - last);
    clearTimeout(timer);
    if (remaining <= 0) {
      last = now;
      fn.apply(this, args);
    } else {
      timer = setTimeout(() => {
        last = Date.now();
        fn.apply(this, args);
      }, remaining);
    }
  };
}

/**
 * Simple djb2 string hash (for request dedup cache keys).
 * Returns a hex string.
 */
export function hashString(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16);
}

/**
 * Wait for ms milliseconds
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Clamp a number between min and max
 */
export function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}
