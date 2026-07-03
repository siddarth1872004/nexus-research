// ============================================================
// NexusResearch -- Research Pipeline
// 8-phase DAG-orchestrated multi-agent research pipeline
// ============================================================

import { Scheduler } from './Scheduler.js';
import { DebateEngine } from './DebateEngine.js';
import { ClaimLedger } from './ClaimLedger.js';
import { blackboard } from './Blackboard.js';
import { store } from '../state.js';
import { clearCache } from '../api/gemini.js';
import { uid, formatElapsed } from '../utils/helpers.js';

const PHASE_NAMES = [
  'Decomposition',
  'Reconnaissance',
  'Deep Research',
  'Analysis',
  'Debate',
  'Verification',
  'Synthesis',
  'Polish',
];

/**
 * Orchestrates the entire multi-agent research workflow.
 * Uses the DAG Scheduler internally but provides a higher-level
 * phase-based interface for UI progress tracking.
 */
export class Pipeline {
  /**
   * @param {import('../agents/AgentRegistry.js').AgentRegistry} registry
   */
  constructor(registry) {
    this.registry = registry;
    this.debateEngine = new DebateEngine();
    this.claimLedger = new ClaimLedger();

    this._abortController = null;
    this._feedCallback = null;  // For activity feed messages
    this._startTime = null;
  }

  /**
   * Set a callback for activity feed messages.
   * @param {Function} cb - (agentId, message, phase) => void
   */
  onFeedMessage(cb) {
    this._feedCallback = cb;
  }

  /**
   * Start the research pipeline.
   * @param {string} query      - User's research query
   * @param {string} depth      - quick | standard | deep | exhaustive
   * @returns {Promise<string>} The final research report (markdown)
   */
  async start(query, depth = 'standard') {
    // Reset state
    this._abortController = new AbortController();
    const signal = this._abortController.signal;
    this._startTime = Date.now();

    blackboard.clear();
    this.debateEngine.clear();
    this.claimLedger.clear();
    clearCache();

    // Activate agents for this depth
    const activeIds = this.registry.activateForDepth(depth);

    // Initialize phases in store
    const phases = PHASE_NAMES.map(name => ({
      name,
      status: 'pending',
      startTime: null,
      endTime: null,
    }));
    store.batchDispatch({
      'research.query': query,
      'research.depth': depth,
      'research.status': 'running',
      'research.startTime': Date.now(),
      'research.endTime': null,
      'research.reportMarkdown': '',
      'research.reportHtml': '',
      'pipeline.phases': phases,
      'pipeline.currentPhase': null,
      'pipeline.activeAgents': [],
    });

    try {
      let report = '';

      if (depth === 'quick') {
        report = await this._runQuickPipeline(query, signal);
      } else {
        report = await this._runFullPipeline(query, depth, signal);
      }

      store.batchDispatch({
        'research.status': 'complete',
        'research.endTime': Date.now(),
        'research.reportMarkdown': report,
      });

      this._feed('director', `Research complete in ${formatElapsed(this._startTime)}`, 'Complete');
      return report;

    } catch (err) {
      if (signal.aborted) {
        store.dispatch('research.status', 'idle');
        return '';
      }
      store.dispatch('research.status', 'error');
      this._feed('director', `Research failed: ${err.message}`, 'Error');
      throw err;
    }
  }

  /**
   * Abort the current research.
   */
  abort() {
    if (this._abortController) {
      this._abortController.abort();
    }
    this.registry.resetAll();
    store.dispatch('research.status', 'idle');
  }

  // ---- Quick Pipeline (3 agents, 3 phases) ----

  async _runQuickPipeline(query, signal) {
    const director = this.registry.get('director');
    const scout = this.registry.get('scout');
    const synthesizer = this.registry.get('synthesizer');

    // Phase 1: Decomposition
    this._setPhase(0);
    this._feed('director', 'Analyzing query and planning research...', PHASE_NAMES[0]);
    director.setStatus('thinking', 'Decomposing query');
    const planRaw = await director.think(
      `Research query: "${query}"\n\nDecompose this into subtasks. Keep it concise (3 subtasks max for a quick analysis).`,
      { signal }
    );
    const plan = director.parseJsonResponse(planRaw);
    this._completePhase(0);

    // Phase 2: Reconnaissance
    this._setPhase(1);
    const subtasks = plan?.subtasks || [{ description: query }];
    this._feed('scout', `Investigating ${subtasks.length} subtask(s)...`, PHASE_NAMES[1]);
    scout.setStatus('thinking', 'Broad investigation');

    const findings = [];
    for (const task of subtasks) {
      if (signal.aborted) throw new Error('Aborted');
      const findingsRaw = await scout.think(
        `Investigate this research subtask: "${task.description}"\nProvide broad findings.`,
        { signal }
      );
      const parsed = scout.parseJsonResponse(findingsRaw);
      if (parsed?.findings) {
        findings.push(...parsed.findings);
        for (const f of parsed.findings) {
          blackboard.post('knowledgeBase', {
            topic: f.topic,
            content: f.content,
            sourceAgent: 'scout',
            confidence: f.confidence || 0.7,
            status: 'raw',
          });
        }
      }
    }
    this._completePhase(1);

    // Skip phases 2-5 for quick mode
    this._skipPhases([2, 3, 4, 5]);

    // Phase 7: Synthesis
    this._setPhase(6);
    this._feed('synthesizer', 'Compiling research report...', PHASE_NAMES[6]);
    synthesizer.setStatus('thinking', 'Writing report');

    const findingsSummary = findings.map((f, i) => `${i + 1}. [${f.topic}] ${f.content}`).join('\n');
    const report = await synthesizer.think(
      `Original research query: "${query}"\n\nFindings:\n${findingsSummary}\n\nCompile a concise but thorough research report.`,
      { signal }
    );
    this._completePhase(6);
    this._skipPhases([7]);

    return report;
  }

  // ---- Full Pipeline (8 phases, parallel DAG) ----

  async _runFullPipeline(query, depth, signal) {
    // Collected data across phases
    let plan = null;
    let allFindings = [];
    let allClaims = [];
    let analysisResults = {};
    let debateResults = [];
    let verifiedClaims = [];
    let report = '';

    // ========== Phase 1: Decomposition ==========
    this._setPhase(0);
    const director = this.registry.get('director');
    this._feed('director', 'Analyzing query and creating research plan...', PHASE_NAMES[0]);
    director.setStatus('thinking', 'Decomposing query');

    const planRaw = await director.think(
      `Research query: "${query}"\n\nDecompose this into a comprehensive research plan with subtasks.`,
      { signal }
    );
    plan = director.parseJsonResponse(planRaw);

    // Auto-depth adjustment
    const subtasks = plan?.subtasks || [{ id: 't1', description: query, priority: 1, dependencies: [] }];
    this._feed('director', `Created ${subtasks.length} subtask(s). Complexity: ${plan?.estimatedComplexity || 'moderate'}`, PHASE_NAMES[0]);
    this._completePhase(0);

    // ========== Phase 2: Reconnaissance (Scout + Strategist parallel) ==========
    this._setPhase(1);
    const scout = this.registry.get('scout');
    const strategist = this.registry.get('strategist');

    // Scout all subtasks
    this._feed('scout', 'Beginning broad reconnaissance...', PHASE_NAMES[1]);
    scout.setStatus('thinking', 'Broad reconnaissance');

    const scoutPromises = subtasks.map(async (task) => {
      if (signal.aborted) return null;
      const raw = await scout.think(
        `Investigate this research subtask: "${task.description}"\nOriginal query context: "${query}"`,
        { signal }
      );
      return scout.parseJsonResponse(raw);
    });

    // Strategist works in parallel (if active)
    let strategyResult = null;
    if (this.registry.isActive('strategist')) {
      this._feed('strategist', 'Developing research strategy...', PHASE_NAMES[1]);
      strategist.setStatus('thinking', 'Planning strategy');

      const stratRaw = await strategist.think(
        `Research plan:\n${JSON.stringify(subtasks, null, 2)}\n\nAnalyze this plan and suggest strategic adjustments.`,
        { signal }
      );
      strategyResult = strategist.parseJsonResponse(stratRaw);
      if (strategyResult?.adjustments?.length) {
        this._feed('strategist', `Suggested ${strategyResult.adjustments.length} strategic adjustment(s)`, PHASE_NAMES[1]);
      }
    }

    const scoutResults = await Promise.allSettled(scoutPromises);
    for (const result of scoutResults) {
      if (result.status === 'fulfilled' && result.value?.findings) {
        allFindings.push(...result.value.findings);
        for (const f of result.value.findings) {
          blackboard.post('knowledgeBase', {
            topic: f.topic,
            content: f.content,
            sourceAgent: 'scout',
            confidence: f.confidence || 0.7,
            status: 'raw',
          });
        }
      }
    }
    this._feed('scout', `Gathered ${allFindings.length} initial findings`, PHASE_NAMES[1]);
    this._completePhase(1);

    // ========== Phase 3: Deep Research ==========
    this._setPhase(2);
    const deepdiver = this.registry.get('deepdiver');
    if (this.registry.isActive('deepdiver')) {
      this._feed('deepdiver', 'Diving deeper into key topics...', PHASE_NAMES[2]);
      deepdiver.setStatus('thinking', 'Deep investigation');

      // Pick top priority subtasks for deep dives
      const deepDiveTopics = subtasks.slice(0, 3).map(t => t.description);
      const findingsSummary = allFindings.map(f => `- [${f.topic}] ${f.content}`).join('\n');

      for (const topic of deepDiveTopics) {
        if (signal.aborted) break;
        const raw = await deepdiver.think(
          `Topic to investigate deeply: "${topic}"\n\nExisting findings for context:\n${findingsSummary}\n\nProvide in-depth analysis.`,
          { signal }
        );
        const parsed = deepdiver.parseJsonResponse(raw);
        if (parsed?.analysis?.detailedFindings) {
          allFindings.push(...parsed.analysis.detailedFindings.map(f => ({
            topic: parsed.analysis.topic,
            content: f.explanation,
            confidence: f.confidence,
          })));
        }
        if (parsed?.claims) {
          allClaims.push(...parsed.claims);
          for (const c of parsed.claims) {
            this.claimLedger.addClaim({
              text: c.text,
              confidence: Math.round((c.confidence || 0.7) * 100),
              sourceAgent: 'deepdiver',
              evidence: [c.evidence || ''],
            });
          }
        }
      }
      this._feed('deepdiver', `Deep analysis complete. ${allClaims.length} claims extracted.`, PHASE_NAMES[2]);
    }

    // Cross-referencer (if active)
    const crossref = this.registry.get('crossreferencer');
    if (this.registry.isActive('crossreferencer')) {
      this._feed('crossreferencer', 'Cross-referencing all findings...', PHASE_NAMES[2]);
      crossref.setStatus('thinking', 'Finding connections');

      const findingsSummary = allFindings.map(f => `- [${f.topic}] ${f.content}`).join('\n');
      const crossRaw = await crossref.think(
        `All research findings so far:\n${findingsSummary}\n\nFind connections, contradictions, and cross-cutting themes.`,
        { signal }
      );
      const crossResult = crossref.parseJsonResponse(crossRaw);
      if (crossResult) {
        analysisResults.crossReferences = crossResult;
        this._feed('crossreferencer', `Found ${crossResult.connections?.length || 0} connections, ${crossResult.contradictions?.length || 0} contradictions`, PHASE_NAMES[2]);
      }
    }
    this._completePhase(2);

    // ========== Phase 4: Analysis (Pattern + Quantifier parallel) ==========
    this._setPhase(3);
    const analysisPromises = [];
    const findingsSummary = allFindings.map(f => `- [${f.topic}] ${f.content}`).join('\n');

    if (this.registry.isActive('pattern')) {
      const patternAgent = this.registry.get('pattern');
      this._feed('pattern', 'Analyzing patterns and trends...', PHASE_NAMES[3]);
      patternAgent.setStatus('thinking', 'Pattern analysis');

      analysisPromises.push(
        patternAgent.think(
          `Research findings:\n${findingsSummary}\n\nIdentify patterns, trends, and anomalies.`,
          { signal }
        ).then(raw => {
          const parsed = patternAgent.parseJsonResponse(raw);
          if (parsed) {
            analysisResults.patterns = parsed;
            this._feed('pattern', `Identified ${parsed.patterns?.length || 0} patterns, ${parsed.anomalies?.length || 0} anomalies`, PHASE_NAMES[3]);
          }
        })
      );
    }

    if (this.registry.isActive('quantifier')) {
      const quantAgent = this.registry.get('quantifier');
      this._feed('quantifier', 'Validating numerical claims...', PHASE_NAMES[3]);
      quantAgent.setStatus('thinking', 'Numerical validation');

      analysisPromises.push(
        quantAgent.think(
          `Research findings with numerical claims:\n${findingsSummary}\n\nExtract, validate, and contextualize all numerical data.`,
          { signal }
        ).then(raw => {
          const parsed = quantAgent.parseJsonResponse(raw);
          if (parsed) {
            analysisResults.quantitative = parsed;
            this._feed('quantifier', `Evaluated ${parsed.metrics?.length || 0} numerical claims`, PHASE_NAMES[3]);
          }
        })
      );
    }

    await Promise.allSettled(analysisPromises);
    this._completePhase(3);

    // ========== Phase 5: Debate (Devil's Advocate + Bias Detector) ==========
    this._setPhase(4);
    if (this.registry.isActive('devil') || this.registry.isActive('bias')) {
      const claimsForDebate = allClaims.length > 0 ? allClaims : allFindings.slice(0, 5);
      const claimsSummary = claimsForDebate.map((c, i) => `${i + 1}. ${c.text || c.content} (confidence: ${c.confidence || 'N/A'})`).join('\n');

      const debatePromises = [];

      if (this.registry.isActive('devil')) {
        const devilAgent = this.registry.get('devil');
        this._feed('devil', 'Challenging findings and assumptions...', PHASE_NAMES[4]);
        devilAgent.setStatus('thinking', 'Critical review');

        debatePromises.push(
          devilAgent.think(
            `Claims and findings to challenge:\n${claimsSummary}\n\nChallenge these critically. Look for weaknesses.`,
            { signal }
          ).then(raw => {
            const parsed = devilAgent.parseJsonResponse(raw);
            if (parsed?.challenges) {
              debateResults.push(...parsed.challenges);
              this._feed('devil', `Raised ${parsed.challenges.length} challenges. Weakest: ${parsed.overallAssessment?.weakestClaims?.length || 0} claims`, PHASE_NAMES[4]);

              // Post challenges to debate board
              for (const challenge of parsed.challenges) {
                blackboard.post('debateBoard', {
                  claim: challenge.targetClaim,
                  challenger: 'devil',
                  challenge: challenge.challenge,
                  severity: challenge.severity,
                  status: 'raised',
                });
              }
            }
          })
        );
      }

      if (this.registry.isActive('bias')) {
        const biasAgent = this.registry.get('bias');
        this._feed('bias', 'Scanning for biases and logical fallacies...', PHASE_NAMES[4]);
        biasAgent.setStatus('thinking', 'Bias analysis');

        debatePromises.push(
          biasAgent.think(
            `Research findings and analysis to check for bias:\n${findingsSummary}\n\nIdentify biases, framing effects, and logical fallacies.`,
            { signal }
          ).then(raw => {
            const parsed = biasAgent.parseJsonResponse(raw);
            if (parsed) {
              analysisResults.biases = parsed;
              this._feed('bias', `Detected ${parsed.biases?.length || 0} biases, risk level: ${parsed.overallBiasRisk || 'unknown'}`, PHASE_NAMES[4]);
            }
          })
        );
      }

      await Promise.allSettled(debatePromises);
    } else {
      this._feed('director', 'Debate phase skipped (not in current depth)', PHASE_NAMES[4]);
    }
    this._completePhase(4);

    // ========== Phase 6: Verification ==========
    this._setPhase(5);
    if (this.registry.isActive('factcheck')) {
      const factchecker = this.registry.get('factcheck');
      this._feed('factcheck', 'Running final verification pass...', PHASE_NAMES[5]);
      factchecker.setStatus('thinking', 'Verification');

      const ledgerClaims = this.claimLedger.getSorted();
      const claimsSummary = ledgerClaims.length > 0
        ? ledgerClaims.map((c, i) => `${i + 1}. [ID:${c.id}] ${c.text} (conf: ${c.confidence}, evidence: ${c.evidence.join('; ')})`).join('\n')
        : allFindings.map((f, i) => `${i + 1}. ${f.content || f.text} (conf: ${Math.round((f.confidence || 0.7) * 100)})`).join('\n');

      const challenges = debateResults.map(d => `- Challenge: ${d.challenge} (severity: ${d.severity})`).join('\n');

      const verifyRaw = await factchecker.think(
        `Claims to verify:\n${claimsSummary}\n\nChallenges raised:\n${challenges || 'None'}\n\nVerify each claim and assign final confidence scores.`,
        { signal }
      );

      const verified = factchecker.parseJsonResponse(verifyRaw);
      if (verified?.verifiedClaims) {
        verifiedClaims = verified.verifiedClaims;
        this._feed('factcheck', `Verified ${verifiedClaims.length} claims. Overall confidence: ${verified.overallConfidence || 'N/A'}%`, PHASE_NAMES[5]);

        // Update claim ledger
        for (const vc of verifiedClaims) {
          const existing = this.claimLedger.get(vc.claimId);
          if (existing) {
            this.claimLedger.updateConfidence(vc.claimId, vc.confidence, 'factcheck');
            this.claimLedger.setStatus(vc.claimId, vc.status === 'verified' ? 'verified' : 'disputed');
          }
        }

        // Sync to blackboard
        for (const claim of this.claimLedger.getSorted()) {
          blackboard.post('claimLedger', {
            claimId: claim.id,
            text: claim.text,
            confidence: claim.confidence,
            status: claim.status,
            agents: claim.contributingAgents,
          });
        }
      }
    }
    this._completePhase(5);

    // ========== Phase 7: Synthesis ==========
    this._setPhase(6);
    const synthesizer = this.registry.get('synthesizer');
    this._feed('synthesizer', 'Compiling comprehensive research report...', PHASE_NAMES[6]);
    synthesizer.setStatus('thinking', 'Writing report');

    // Build synthesis context
    const synthContext = this._buildSynthesisContext(query, allFindings, analysisResults, verifiedClaims, debateResults);

    report = await synthesizer.think(synthContext, { signal });
    this._completePhase(6);

    // ========== Phase 8: Polish ==========
    this._setPhase(7);

    // Visualizer (if active) -- runs parallel to editor
    if (this.registry.isActive('visualizer')) {
      const vizAgent = this.registry.get('visualizer');
      this._feed('visualizer', 'Generating data visualizations...', PHASE_NAMES[7]);
      vizAgent.setStatus('thinking', 'Creating tables');

      const vizRaw = await vizAgent.think(
        `Research findings summary:\n${allFindings.slice(0, 10).map(f => `- ${f.content || f.text}`).join('\n')}\n\nGenerate structured data tables and key stats.`,
        { signal }
      );
      const vizResult = vizAgent.parseJsonResponse(vizRaw);
      if (vizResult?.tables) {
        // Append tables to report
        let tablesMd = '\n\n## Data Summary\n';
        for (const table of vizResult.tables) {
          tablesMd += `\n### ${table.title}\n`;
          tablesMd += `| ${table.headers.join(' | ')} |\n`;
          tablesMd += `| ${table.headers.map(() => '---').join(' | ')} |\n`;
          for (const row of table.rows) {
            tablesMd += `| ${row.join(' | ')} |\n`;
          }
        }
        if (vizResult.keyStats?.length) {
          tablesMd += '\n### Key Statistics\n';
          for (const stat of vizResult.keyStats) {
            tablesMd += `- **${stat.label}**: ${stat.value} -- ${stat.context}\n`;
          }
        }
        report += tablesMd;
        this._feed('visualizer', `Generated ${vizResult.tables.length} table(s) and ${vizResult.keyStats?.length || 0} key stats`, PHASE_NAMES[7]);
      }
    }

    // Editor (if active)
    if (this.registry.isActive('editor')) {
      const editorAgent = this.registry.get('editor');
      this._feed('editor', 'Polishing final report...', PHASE_NAMES[7]);
      editorAgent.setStatus('thinking', 'Final polish');

      const polished = await editorAgent.think(
        `Polish and improve this research report. Fix grammar, improve flow, eliminate redundancy. Do not add new information.\n\n${report}`,
        { signal }
      );
      if (polished && polished.length > report.length * 0.5) {
        report = polished;
      }
      this._feed('editor', 'Final polish complete', PHASE_NAMES[7]);
    }

    this._completePhase(7);

    return report;
  }

  // ---- Helpers ----

  _buildSynthesisContext(query, findings, analysis, verified, debates) {
    let ctx = `Original research query: "${query}"\n\n`;
    ctx += `### Findings (${findings.length}):\n`;
    ctx += findings.slice(0, 15).map(f => `- [${f.topic || 'General'}] ${f.content || f.text}`).join('\n');

    if (analysis.patterns?.patterns?.length) {
      ctx += `\n\n### Patterns Identified:\n`;
      ctx += analysis.patterns.patterns.map(p => `- ${p.name}: ${p.description}`).join('\n');
    }

    if (analysis.crossReferences?.connections?.length) {
      ctx += `\n\n### Cross-References:\n`;
      ctx += analysis.crossReferences.connections.map(c => `- ${c.between.join(' <-> ')}: ${c.relationship}`).join('\n');
    }

    if (verified.length) {
      ctx += `\n\n### Verified Claims:\n`;
      ctx += verified.map(v => `- [Conf: ${v.confidence}%] ${v.claimText}`).join('\n');
    }

    if (debates.length) {
      ctx += `\n\n### Challenges Raised:\n`;
      ctx += debates.map(d => `- [${d.severity}] ${d.challenge}`).join('\n');
    }

    if (analysis.biases?.biases?.length) {
      ctx += `\n\n### Biases Detected:\n`;
      ctx += analysis.biases.biases.map(b => `- [${b.type}] ${b.description}`).join('\n');
    }

    ctx += `\n\nCompile a comprehensive, well-structured research report with all these inputs.`;
    return ctx;
  }

  _setPhase(index) {
    store.dispatch('pipeline.currentPhase', index);
    const phases = store.get('pipeline.phases');
    if (phases && phases[index]) {
      phases[index].status = 'active';
      phases[index].startTime = Date.now();
      store.dispatch('pipeline.phases', [...phases]);
    }
  }

  _completePhase(index) {
    const phases = store.get('pipeline.phases');
    if (phases && phases[index]) {
      phases[index].status = 'complete';
      phases[index].endTime = Date.now();
      store.dispatch('pipeline.phases', [...phases]);
    }
  }

  _skipPhases(indices) {
    const phases = store.get('pipeline.phases');
    for (const idx of indices) {
      if (phases && phases[idx]) {
        phases[idx].status = 'skipped';
      }
    }
    store.dispatch('pipeline.phases', [...phases]);
  }

  _feed(agentId, message, phase) {
    if (this._feedCallback) {
      this._feedCallback(agentId, message, phase);
    }
  }
}
