// ============================================================
// NexusResearch -- AgentRegistry
// Factory, lifecycle management, and agent lookup
// ============================================================

import { Agent } from './Agent.js';
import { AGENT_PROMPTS } from './prompts.js';
import { store } from '../state.js';

/**
 * Agent configuration definitions.
 * Each entry defines an agent's identity, tier, and color.
 */
const AGENT_CONFIGS = [
  // Command Tier
  { id: 'director',        name: 'Director',        role: 'Task decomposition and orchestration',      tier: 'command',  colorHex: '#ffffff', colorVar: '--color-director' },
  { id: 'strategist',      name: 'Strategist',      role: 'Research planning and gap analysis',         tier: 'command',  colorHex: '#f4f4f5', colorVar: '--color-strategist' },

  // Research Tier
  { id: 'scout',           name: 'Scout',           role: 'Broad reconnaissance',                      tier: 'research', colorHex: '#e4e4e7', colorVar: '--color-scout' },
  { id: 'deepdiver',       name: 'Deep Diver',      role: 'Targeted deep investigation',               tier: 'research', colorHex: '#d4d4d8', colorVar: '--color-deepdiver' },
  { id: 'crossreferencer', name: 'Cross-Ref',       role: 'Cross-referencing and linking findings',     tier: 'research', colorHex: '#a1a1aa', colorVar: '--color-crossref' },

  // Analysis Tier
  { id: 'pattern',         name: 'Pattern Analyst',  role: 'Trend and pattern identification',         tier: 'analysis', colorHex: '#ffffff', colorVar: '--color-pattern' },
  { id: 'devil',           name: 'Devils Advocate',  role: 'Challenging assumptions and findings',      tier: 'analysis', colorHex: '#f4f4f5', colorVar: '--color-devil' },
  { id: 'quantifier',      name: 'Quantifier',       role: 'Numerical validation and benchmarking',    tier: 'analysis', colorHex: '#e4e4e7', colorVar: '--color-quantifier' },
  { id: 'bias',            name: 'Bias Detector',    role: 'Bias and fallacy identification',           tier: 'analysis', colorHex: '#d4d4d8', colorVar: '--color-bias' },

  // Output Tier
  { id: 'factcheck',       name: 'Fact Checker',     role: 'Final verification and confidence scoring', tier: 'output',   colorHex: '#ffffff', colorVar: '--color-factcheck' },
  { id: 'synthesizer',     name: 'Synthesizer',      role: 'Report compilation and narrative',          tier: 'output',   colorHex: '#e4e4e7', colorVar: '--color-synthesizer' },
  { id: 'visualizer',      name: 'Visualizer',       role: 'Data tables and visual summaries',          tier: 'output',   colorHex: '#d4d4d8', colorVar: '--color-visualizer' },
  { id: 'editor',          name: 'Editor',           role: 'Style, coherence, and clarity review',      tier: 'output',   colorHex: '#a1a1aa', colorVar: '--color-editor' },
];

/**
 * Depth -> which agent IDs are active
 */
const DEPTH_AGENTS = {
  quick:      ['director', 'scout', 'synthesizer'],
  standard:   ['director', 'strategist', 'scout', 'deepdiver', 'pattern', 'factcheck', 'synthesizer', 'editor'],
  deep:       ['director', 'strategist', 'scout', 'deepdiver', 'crossreferencer', 'pattern', 'devil', 'quantifier', 'factcheck', 'synthesizer', 'visualizer', 'editor'],
  exhaustive: ['director', 'strategist', 'scout', 'deepdiver', 'crossreferencer', 'pattern', 'devil', 'quantifier', 'bias', 'factcheck', 'synthesizer', 'visualizer', 'editor'],
};

export class AgentRegistry {
  constructor() {
    this._agents = new Map();
    this._activeSet = new Set();
    this._init();
  }

  /** Initialize all agents from configs */
  _init() {
    for (const cfg of AGENT_CONFIGS) {
      const agent = new Agent({
        id: cfg.id,
        name: cfg.name,
        role: cfg.role,
        tier: cfg.tier,
        color: cfg.colorVar,
        colorHex: cfg.colorHex,
        systemPrompt: AGENT_PROMPTS[cfg.id] || '',
      });
      this._agents.set(cfg.id, agent);
    }
  }

  /** Get agent by ID */
  get(id) {
    return this._agents.get(id) || null;
  }

  /** Get all agents */
  getAll() {
    return [...this._agents.values()];
  }

  /** Get agents by tier */
  getByTier(tier) {
    return [...this._agents.values()].filter(a => a.tier === tier);
  }

  /** Get all agent configs (for UI rendering) */
  getConfigs() {
    return AGENT_CONFIGS;
  }

  /**
   * Activate agents for a given depth level.
   * Sets active agents and marks inactive ones.
   */
  activateForDepth(depth) {
    const ids = DEPTH_AGENTS[depth] || DEPTH_AGENTS.standard;
    this._activeSet = new Set(ids);

    // Update all agent statuses in store
    const agentStates = {};
    for (const [id, agent] of this._agents) {
      if (this._activeSet.has(id)) {
        agent.setStatus('idle');
      } else {
        agent.status = 'idle';
      }
      agentStates[id] = {
        id: agent.id,
        name: agent.name,
        role: agent.role,
        tier: agent.tier,
        status: agent.status,
        currentTask: null,
        active: this._activeSet.has(id),
      };
    }
    store.dispatch('agents', agentStates);

    return ids;
  }

  /** Check if an agent is active for the current research */
  isActive(id) {
    return this._activeSet.has(id);
  }

  /** Get only active agents */
  getActive() {
    return [...this._agents.values()].filter(a => this._activeSet.has(a.id));
  }

  /** Reset all agents for a new research session */
  resetAll() {
    for (const agent of this._agents.values()) {
      agent.reset();
    }
    this._activeSet.clear();
  }

  /** Get the depth config */
  static getDepthAgents() {
    return DEPTH_AGENTS;
  }

  /** Get all configs (static access) */
  static getAllConfigs() {
    return AGENT_CONFIGS;
  }
}
