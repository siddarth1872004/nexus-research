// ============================================================
// NexusResearch -- Blackboard System
// Shared knowledge space with reactive subscriptions
// ============================================================

import { uid } from '../utils/helpers.js';
import { store } from '../state.js';

/**
 * The Blackboard is the central nervous system of the multi-agent swarm.
 * Four sections:
 *   - knowledgeBase: raw findings and sources
 *   - taskQueue:     prioritized sub-tasks
 *   - debateBoard:   challenges and rebuttals
 *   - claimLedger:   verified claims with confidence scores
 *
 * Agents write to the blackboard; the blackboard notifies subscribers
 * (other agents and UI components) of changes.
 */

class Blackboard {
  constructor() {
    this._sections = {
      knowledgeBase: [],
      taskQueue: [],
      debateBoard: [],
      claimLedger: [],
    };
    this._subscribers = {
      knowledgeBase: new Set(),
      taskQueue: new Set(),
      debateBoard: new Set(),
      claimLedger: new Set(),
    };
  }

  /**
   * Post an entry to a section.
   * @param {'knowledgeBase'|'taskQueue'|'debateBoard'|'claimLedger'} section
   * @param {Object} data
   * @returns {Object} The posted entry with id and timestamp
   */
  post(section, data) {
    const entry = {
      id: uid(),
      timestamp: Date.now(),
      ...data,
    };
    this._sections[section].push(entry);
    this._syncToStore(section);
    this._notifySubscribers(section, entry);
    return entry;
  }

  /**
   * Update an existing entry in a section.
   */
  update(section, id, updates) {
    const arr = this._sections[section];
    const idx = arr.findIndex(e => e.id === id);
    if (idx === -1) return null;
    Object.assign(arr[idx], updates, { updatedAt: Date.now() });
    this._syncToStore(section);
    return arr[idx];
  }

  /**
   * Query entries from a section with optional filter.
   * @param {string} section
   * @param {Function} [filterFn] - Predicate function
   * @returns {Array}
   */
  query(section, filterFn = null) {
    const data = this._sections[section];
    return filterFn ? data.filter(filterFn) : [...data];
  }

  /**
   * Get a single entry by ID.
   */
  getById(section, id) {
    return this._sections[section].find(e => e.id === id) || null;
  }

  /**
   * Subscribe to new entries in a section.
   * @returns {Function} Unsubscribe function
   */
  subscribe(section, callback) {
    this._subscribers[section].add(callback);
    return () => this._subscribers[section].delete(callback);
  }

  /**
   * Get counts for all sections (for UI badges).
   */
  getCounts() {
    return {
      knowledgeBase: this._sections.knowledgeBase.length,
      taskQueue: this._sections.taskQueue.length,
      debateBoard: this._sections.debateBoard.length,
      claimLedger: this._sections.claimLedger.length,
    };
  }

  /**
   * Compact a section: keep only summaries, discard full content.
   * Called after a phase completes to reduce memory.
   */
  compact(section) {
    this._sections[section] = this._sections[section].map(entry => ({
      id: entry.id,
      timestamp: entry.timestamp,
      sourceAgent: entry.sourceAgent,
      topic: entry.topic || '',
      summary: entry.summary || (entry.content ? entry.content.slice(0, 200) : ''),
      status: entry.status || 'archived',
      confidence: entry.confidence,
    }));
    this._syncToStore(section);
  }

  /**
   * Clear all sections. Called at the start of a new research session.
   */
  clear() {
    for (const section of Object.keys(this._sections)) {
      this._sections[section] = [];
    }
    store.dispatch('blackboard', {
      knowledgeBase: [],
      taskQueue: [],
      debateBoard: [],
      claimLedger: [],
    });
  }

  /** Sync section data to the reactive store for UI rendering */
  _syncToStore(section) {
    store.dispatch(`blackboard.${section}`, [...this._sections[section]]);
  }

  /** Notify subscribers of a new entry */
  _notifySubscribers(section, entry) {
    for (const cb of this._subscribers[section]) {
      try { cb(entry, section); } catch (e) { console.error('[Blackboard] Subscriber error:', e); }
    }
  }
}

export const blackboard = new Blackboard();
