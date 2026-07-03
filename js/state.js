// ============================================================
// NexusResearch -- Reactive State Store
// Centralized Pub/Sub state with path-based subscriptions
// ============================================================

/**
 * Lightweight reactive store.
 * - `subscribe(path, callback)` reacts to changes at a dot-path
 * - `dispatch(path, value)` sets a value and notifies subscribers
 * - Batches notifications within a single microtask
 */

class Store {
  constructor(initialState = {}) {
    this._state = initialState;
    this._subs = new Map();       // path -> Set<callback>
    this._pendingPaths = new Set();
    this._flushScheduled = false;
  }

  /** Get a value by dot-path. Returns undefined if not found. */
  get(path) {
    return path.split('.').reduce((obj, key) => obj?.[key], this._state);
  }

  /** Set a value by dot-path and schedule notification. */
  dispatch(path, value) {
    const keys = path.split('.');
    let obj = this._state;
    for (let i = 0; i < keys.length - 1; i++) {
      if (obj[keys[i]] === undefined) obj[keys[i]] = {};
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
    this._pendingPaths.add(path);
    this._scheduleFlush();
  }

  /** Batch-update multiple paths at once. Single flush. */
  batchDispatch(updates) {
    for (const [path, value] of Object.entries(updates)) {
      const keys = path.split('.');
      let obj = this._state;
      for (let i = 0; i < keys.length - 1; i++) {
        if (obj[keys[i]] === undefined) obj[keys[i]] = {};
        obj = obj[keys[i]];
      }
      obj[keys[keys.length - 1]] = value;
      this._pendingPaths.add(path);
    }
    this._scheduleFlush();
  }

  /** Subscribe to changes at a dot-path. Returns an unsubscribe function. */
  subscribe(path, callback) {
    if (!this._subs.has(path)) {
      this._subs.set(path, new Set());
    }
    this._subs.get(path).add(callback);
    return () => {
      const set = this._subs.get(path);
      if (set) {
        set.delete(callback);
        if (set.size === 0) this._subs.delete(path);
      }
    };
  }

  /** Schedule a microtask flush if not already scheduled */
  _scheduleFlush() {
    if (!this._flushScheduled) {
      this._flushScheduled = true;
      queueMicrotask(() => this._flush());
    }
  }

  /** Notify all matching subscribers */
  _flush() {
    this._flushScheduled = false;
    const paths = [...this._pendingPaths];
    this._pendingPaths.clear();

    for (const changedPath of paths) {
      // Notify exact match
      this._notify(changedPath);

      // Notify parent paths (e.g., 'agents' when 'agents.director.status' changes)
      const parts = changedPath.split('.');
      for (let i = parts.length - 1; i > 0; i--) {
        this._notify(parts.slice(0, i).join('.'));
      }
    }
  }

  _notify(path) {
    const set = this._subs.get(path);
    if (set) {
      const value = this.get(path);
      for (const cb of set) {
        try { cb(value, path); } catch (e) { console.error('[State] Subscriber error:', e); }
      }
    }
  }

  /** Get full snapshot (read-only shallow copy) */
  snapshot() {
    return { ...this._state };
  }

  /** Reset state to initial values */
  reset(newState = {}) {
    this._state = newState;
    this._pendingPaths.clear();
    // Notify root subscribers
    this._pendingPaths.add('');
    this._scheduleFlush();
  }
}

// ---- Singleton Instance with initial state ----

export const store = new Store({
  // Research session
  research: {
    query: '',
    depth: 'standard',    // quick | standard | deep | exhaustive | auto
    status: 'idle',       // idle | running | paused | complete | error
    startTime: null,
    endTime: null,
    reportMarkdown: '',
    reportHtml: '',
  },

  // Agent states: populated by AgentRegistry
  agents: {},

  // Blackboard mirror for UI
  blackboard: {
    knowledgeBase: [],
    taskQueue: [],
    debateBoard: [],
    claimLedger: [],
  },

  // Pipeline progress
  pipeline: {
    currentPhase: null,       // 0-7 index or null
    phases: [],               // Array of { name, status, startTime, endTime }
    activeAgents: [],         // IDs of currently active agents
  },

  // UI state
  ui: {
    view: 'landing',          // landing | research
    activeTab: 'report',      // report | debates | claims
    feedFilter: 'all',        // all | <agentId>
    modalOpen: null,          // null | 'settings' | 'history' | 'about'
    toastQueue: [],
  },
});
