// ============================================================
// NexusResearch -- DebateEngine
// Adversarial debate protocol with consensus scoring
// ============================================================

import { uid } from '../utils/helpers.js';

/**
 * Manages structured debates between agents.
 * Max 3 rounds per debate. Each round is an argument/counter-argument pair.
 * Resolution via weighted consensus scoring.
 */

export class DebateEngine {
  constructor() {
    this._debates = new Map();
    this._listeners = new Set();
  }

  /**
   * Initiate a new debate on a claim.
   * @param {Object} params
   * @param {string} params.claimId       - ID of the disputed claim
   * @param {string} params.claimText     - The claim being challenged
   * @param {string} params.challengerId  - Agent challenging the claim
   * @param {string} params.challengerArg - The challenge argument
   * @param {string} params.defenderId    - Agent defending the claim
   * @returns {Object} The debate object
   */
  initDebate({ claimId, claimText, challengerId, challengerArg, defenderId }) {
    const debate = {
      id: uid(),
      claimId,
      claimText,
      challengerId,
      defenderId,
      rounds: [
        {
          agentId: challengerId,
          argument: challengerArg,
          timestamp: Date.now(),
        },
      ],
      status: 'active',        // active | resolved
      resolution: null,        // accepted | rejected | modified
      finalConfidence: null,
      consensusBreakdown: null,
      maxRounds: 3,
      createdAt: Date.now(),
      resolvedAt: null,
    };
    this._debates.set(debate.id, debate);
    this._emit('init', debate);
    return debate;
  }

  /**
   * Add a round to a debate (rebuttal or counter-argument).
   */
  addRound(debateId, agentId, argument) {
    const debate = this._debates.get(debateId);
    if (!debate || debate.status !== 'active') return null;

    debate.rounds.push({
      agentId,
      argument,
      timestamp: Date.now(),
    });
    this._emit('round', debate);

    // Check if max rounds reached
    if (debate.rounds.length >= debate.maxRounds * 2) {
      // Auto-resolve if both sides have maxRounds each
      // Caller should explicitly resolve instead
    }
    return debate;
  }

  /**
   * Check if a debate needs a response from a specific side.
   */
  needsResponse(debateId) {
    const debate = this._debates.get(debateId);
    if (!debate || debate.status !== 'active') return null;
    const lastRound = debate.rounds[debate.rounds.length - 1];
    if (lastRound.agentId === debate.challengerId) return debate.defenderId;
    if (lastRound.agentId === debate.defenderId) return debate.challengerId;
    return null;
  }

  /**
   * Check if debate has reached max rounds.
   */
  isMaxRoundsReached(debateId) {
    const debate = this._debates.get(debateId);
    if (!debate) return true;
    // Each "round" = one exchange. Max 3 rounds = 6 total entries (3 per side).
    // But we count by unique rounds (challenge + response = 1 round).
    return debate.rounds.length >= debate.maxRounds * 2;
  }

  /**
   * Resolve a debate with a consensus score.
   * @param {string} debateId
   * @param {Object} scoring
   * @param {number} scoring.evidenceStrength   - 0-1
   * @param {number} scoring.logicalCoherence   - 0-1
   * @param {number} scoring.sourceDiversity    - 0-1
   * @param {number} scoring.counterArgQuality  - 0-1
   * @returns {Object} Resolution result
   */
  resolveDebate(debateId, scoring) {
    const debate = this._debates.get(debateId);
    if (!debate) return null;

    // Weighted consensus: higher score = claim is upheld
    const weights = {
      evidenceStrength: 0.35,
      logicalCoherence: 0.30,
      sourceDiversity: 0.15,
      counterArgQuality: 0.20,
    };

    const defenseScore =
      (scoring.evidenceStrength * weights.evidenceStrength) +
      (scoring.logicalCoherence * weights.logicalCoherence) +
      (scoring.sourceDiversity * weights.sourceDiversity) +
      ((1 - scoring.counterArgQuality) * weights.counterArgQuality);

    const confidence = Math.round(defenseScore * 100);

    let resolution;
    if (confidence >= 70) resolution = 'accepted';
    else if (confidence >= 40) resolution = 'modified';
    else resolution = 'rejected';

    debate.status = 'resolved';
    debate.resolution = resolution;
    debate.finalConfidence = confidence;
    debate.consensusBreakdown = { ...scoring, defenseScore };
    debate.resolvedAt = Date.now();

    this._emit('resolve', debate);

    return {
      debateId: debate.id,
      claimId: debate.claimId,
      resolution,
      confidence,
      breakdown: debate.consensusBreakdown,
    };
  }

  /** Get a debate by ID */
  get(debateId) { return this._debates.get(debateId) || null; }

  /** Get all debates */
  getAll() { return [...this._debates.values()]; }

  /** Get active debates */
  getActive() {
    return [...this._debates.values()].filter(d => d.status === 'active');
  }

  /** Clear all debates */
  clear() { this._debates.clear(); }

  /** Subscribe to debate events */
  on(callback) {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  _emit(event, debate) {
    for (const cb of this._listeners) {
      try { cb(event, debate); } catch (e) { console.error('[DebateEngine]', e); }
    }
  }
}
