// ============================================================
// NexusResearch -- Agent Base Class
// Agent lifecycle, API calls, blackboard interaction
// ============================================================

import { generate, streamGenerate, PRIORITY } from '../api/gemini.js';
import { store } from '../state.js';

/**
 * Agent status lifecycle:
 *   idle -> assigned -> thinking -> complete
 *                   \-> debating -> complete
 *                   \-> error
 */

// SVG path data for agent icons (geometric/abstract, no emoji)
export const AGENT_ICONS = {
  director:       'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  strategist:     'M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9m-12 12H5a2 2 0 01-2-2V9m0 0h18',
  scout:          'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
  deepdiver:      'M19 14l-7 7m0 0l-7-7m7 7V3',
  crossreferencer:'M8 7h12M8 12h12M8 17h12M4 7h.01M4 12h.01M4 17h.01',
  pattern:        'M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z',
  devil:          'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z',
  quantifier:     'M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z',
  bias:           'M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5 5 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3',
  factcheck:      'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  synthesizer:    'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
  visualizer:     'M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm0 8a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zm12 0a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z',
  editor:         'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z',
};

// Tier -> priority mapping for rate limiter
const TIER_PRIORITY = {
  command:  PRIORITY.COMMAND,
  research: PRIORITY.RESEARCH,
  analysis: PRIORITY.ANALYSIS,
  output:   PRIORITY.ANALYSIS,
};

export class Agent {
  /**
   * @param {Object} config
   * @param {string} config.id          - Unique agent ID (e.g., 'director')
   * @param {string} config.name        - Display name (e.g., 'Director')
   * @param {string} config.role        - Short role description
   * @param {string} config.tier        - 'command' | 'research' | 'analysis' | 'output'
   * @param {string} config.color       - CSS color variable name (e.g., '--color-director')
   * @param {string} config.colorHex    - Hex color for canvas
   * @param {string} config.systemPrompt- Full system prompt
   */
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.role = config.role;
    this.tier = config.tier;
    this.color = config.color;
    this.colorHex = config.colorHex;
    this.systemPrompt = config.systemPrompt;
    this.iconPath = AGENT_ICONS[config.id] || '';

    // Conversation memory (sliding window)
    this._memory = [];
    this._maxMemory = 3;

    // Status
    this.status = 'idle';     // idle | assigned | thinking | debating | complete | error
    this.currentTask = null;
    this.lastOutput = null;
  }

  /**
   * Send a prompt to this agent and get a response.
   * Updates agent status and memory automatically.
   * @param {string} input        - The user/system prompt for this turn
   * @param {Object} [options]
   * @param {AbortSignal} [options.signal]
   * @param {Function}    [options.onChunk]   - If provided, streams
   * @param {boolean}     [options.useCache]
   * @returns {Promise<string>} Agent's response text
   */
  async think(input, { signal, onChunk, useCache = true } = {}) {
    this.setStatus('thinking');

    // Add to memory
    this._memory.push({ role: 'user', text: input });
    this._trimMemory();

    const priority = TIER_PRIORITY[this.tier] || PRIORITY.ANALYSIS;

    try {
      let response;

      if (onChunk) {
        response = await streamGenerate({
          systemPrompt: this.systemPrompt,
          messages: [...this._memory],
          onChunk,
          priority,
          signal,
        });
      } else {
        response = await generate({
          systemPrompt: this.systemPrompt,
          messages: [...this._memory],
          priority,
          signal,
          useCache,
        });
      }

      // Add response to memory
      this._memory.push({ role: 'model', text: response });
      this._trimMemory();

      this.lastOutput = response;
      this.setStatus('complete');
      return response;
    } catch (err) {
      this.setStatus('error');
      throw err;
    }
  }

  /**
   * Parse the agent's JSON response. Returns the parsed object or null.
   */
  parseJsonResponse(text) {
    if (!text) return null;
    // Strip markdown code fences if present
    let cleaned = text.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }
    try {
      return JSON.parse(cleaned);
    } catch {
      console.warn(`[Agent:${this.id}] Failed to parse JSON response`);
      return null;
    }
  }

  /**
   * Update agent status and sync to store.
   */
  setStatus(status, taskDescription = null) {
    this.status = status;
    if (taskDescription !== null) this.currentTask = taskDescription;
    if (status === 'idle' || status === 'complete') this.currentTask = null;

    store.dispatch(`agents.${this.id}`, {
      id: this.id,
      name: this.name,
      role: this.role,
      tier: this.tier,
      status: this.status,
      currentTask: this.currentTask,
    });
  }

  /**
   * Reset agent state for a new research session.
   */
  reset() {
    this._memory = [];
    this.status = 'idle';
    this.currentTask = null;
    this.lastOutput = null;
    this.setStatus('idle');
  }

  /**
   * Trim memory to sliding window.
   */
  _trimMemory() {
    // Keep at most _maxMemory pairs (user + model = 2 entries per pair)
    const maxEntries = this._maxMemory * 2;
    if (this._memory.length > maxEntries) {
      this._memory = this._memory.slice(-maxEntries);
    }
  }
}
