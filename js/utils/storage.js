// ============================================================
// NexusResearch -- Storage
// localStorage wrapper for API key, settings, research history
// ============================================================

const PREFIX = 'nexus_';

function key(name) {
  return PREFIX + name;
}

export const Storage = {
  get(name, fallback = null) {
    try {
      const raw = localStorage.getItem(key(name));
      return raw !== null ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },

  set(name, value) {
    try {
      localStorage.setItem(key(name), JSON.stringify(value));
    } catch {
      // Quota exceeded -- silently fail
    }
  },

  remove(name) {
    localStorage.removeItem(key(name));
  },

  // ---- Convenience accessors ----

  getApiKey() {
    return this.get('api_key', '');
  },

  setApiKey(k) {
    this.set('api_key', k);
  },

  getSettings() {
    return this.get('settings', {
      depth: 'standard',
      theme: 'dark',
      maxConcurrency: 3,
    });
  },

  setSettings(s) {
    this.set('settings', s);
  },

  // ---- Research History ----
  // Stores an array of { id, query, depth, timestamp, reportMarkdown }
  // Max 20 entries; oldest are pruned.

  getHistory() {
    return this.get('history', []);
  },

  addHistory(entry) {
    const history = this.getHistory();
    history.unshift(entry);
    if (history.length > 20) history.length = 20;
    this.set('history', history);
  },

  clearHistory() {
    this.remove('history');
  },
};
