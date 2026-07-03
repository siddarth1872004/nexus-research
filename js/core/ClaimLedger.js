// ============================================================
// NexusResearch -- ClaimLedger
// Verified claims repository with confidence scoring
// ============================================================

import { uid } from '../utils/helpers.js';

export class ClaimLedger {
  constructor() {
    this._claims = new Map();
    this._listeners = new Set();
  }

  /**
   * Add a new claim.
   * @param {Object} claimDef
   * @param {string} claimDef.text         - The claim statement
   * @param {number} claimDef.confidence   - 0-100
   * @param {string} claimDef.sourceAgent  - Agent that produced this claim
   * @param {string} [claimDef.topic]      - Related topic/sub-task
   * @param {string[]} [claimDef.evidence] - Evidence descriptions
   * @returns {Object} The created claim
   */
  addClaim(claimDef) {
    const claim = {
      id: uid(),
      text: claimDef.text,
      confidence: claimDef.confidence || 50,
      sourceAgent: claimDef.sourceAgent,
      contributingAgents: [claimDef.sourceAgent],
      topic: claimDef.topic || '',
      evidence: claimDef.evidence || [],
      debateId: null,
      status: 'unverified',   // unverified | disputed | verified | rejected
      createdAt: Date.now(),
    };
    this._claims.set(claim.id, claim);
    this._emit('add', claim);
    return claim;
  }

  /**
   * Update confidence score.
   */
  updateConfidence(claimId, newConfidence, agentId = null) {
    const claim = this._claims.get(claimId);
    if (!claim) return;
    claim.confidence = Math.max(0, Math.min(100, newConfidence));
    if (agentId && !claim.contributingAgents.includes(agentId)) {
      claim.contributingAgents.push(agentId);
    }
    this._emit('update', claim);
  }

  /**
   * Mark a claim's status.
   */
  setStatus(claimId, status, debateId = null) {
    const claim = this._claims.get(claimId);
    if (!claim) return;
    claim.status = status;
    if (debateId) claim.debateId = debateId;
    this._emit('update', claim);
  }

  /**
   * Add evidence to a claim.
   */
  addEvidence(claimId, evidence, agentId) {
    const claim = this._claims.get(claimId);
    if (!claim) return;
    claim.evidence.push(evidence);
    if (agentId && !claim.contributingAgents.includes(agentId)) {
      claim.contributingAgents.push(agentId);
    }
    this._emit('update', claim);
  }

  /** Get all claims, optionally filtered by min confidence */
  getClaims(minConfidence = 0) {
    return [...this._claims.values()].filter(c => c.confidence >= minConfidence);
  }

  /** Get claims by status */
  getByStatus(status) {
    return [...this._claims.values()].filter(c => c.status === status);
  }

  /** Get a single claim */
  get(claimId) {
    return this._claims.get(claimId) || null;
  }

  /** Get all claims sorted by confidence descending */
  getSorted() {
    return [...this._claims.values()].sort((a, b) => b.confidence - a.confidence);
  }

  /** Average confidence across all claims */
  get averageConfidence() {
    const claims = [...this._claims.values()];
    if (claims.length === 0) return 0;
    return Math.round(claims.reduce((sum, c) => sum + c.confidence, 0) / claims.length);
  }

  get size() { return this._claims.size; }

  /** Clear all claims */
  clear() { this._claims.clear(); }

  /** Subscribe to claim events */
  on(callback) {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  _emit(event, claim) {
    for (const cb of this._listeners) {
      try { cb(event, claim); } catch (e) { console.error('[ClaimLedger]', e); }
    }
  }
}
