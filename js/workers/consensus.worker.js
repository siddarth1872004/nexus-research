// ============================================================
// NexusResearch -- Consensus Scorer Worker
// Off-thread weighted debate consensus scoring
// ============================================================

/**
 * Web Worker for computing debate consensus scores.
 * Receives: { id, debate } where debate contains rounds
 * Posts:    { id, result } with scoring breakdown
 */

self.onmessage = function(e) {
  const { id, debate } = e.data;

  const weights = {
    evidenceStrength: 0.35,
    logicalCoherence: 0.30,
    sourceDiversity: 0.15,
    counterArgQuality: 0.20,
  };

  // Analyze the debate rounds to extract scoring signals
  const rounds = debate.rounds || [];
  const challengerRounds = rounds.filter(r => r.agentId === debate.challengerId);
  const defenderRounds = rounds.filter(r => r.agentId === debate.defenderId);

  // Heuristic scoring based on argument quality signals
  // (In production, this would be more sophisticated)
  const evidenceStrength = scoreEvidence(defenderRounds, challengerRounds);
  const logicalCoherence = scoreCoherence(defenderRounds);
  const sourceDiversity = scoreDiversity(defenderRounds);
  const counterArgQuality = scoreCounterArgs(challengerRounds);

  const defenseScore =
    (evidenceStrength * weights.evidenceStrength) +
    (logicalCoherence * weights.logicalCoherence) +
    (sourceDiversity * weights.sourceDiversity) +
    ((1 - counterArgQuality) * weights.counterArgQuality);

  const confidence = Math.round(defenseScore * 100);

  let resolution;
  if (confidence >= 70) resolution = 'accepted';
  else if (confidence >= 40) resolution = 'modified';
  else resolution = 'rejected';

  self.postMessage({
    id,
    result: {
      evidenceStrength,
      logicalCoherence,
      sourceDiversity,
      counterArgQuality,
      defenseScore,
      confidence,
      resolution,
    },
  });
};

function scoreEvidence(defense, challenge) {
  // Longer, more detailed arguments suggest more evidence
  const defLen = defense.reduce((sum, r) => sum + (r.argument?.length || 0), 0);
  const chalLen = challenge.reduce((sum, r) => sum + (r.argument?.length || 0), 0);
  if (defLen + chalLen === 0) return 0.5;
  return Math.min(1, defLen / (defLen + chalLen) + 0.1);
}

function scoreCoherence(defense) {
  if (defense.length === 0) return 0.5;
  // Check if defense arguments build on each other (proxy: increasing length)
  const lengths = defense.map(r => r.argument?.length || 0);
  let coherent = 0;
  for (let i = 1; i < lengths.length; i++) {
    if (lengths[i] >= lengths[i - 1] * 0.5) coherent++;
  }
  return lengths.length > 1 ? 0.5 + (coherent / (lengths.length - 1)) * 0.5 : 0.6;
}

function scoreDiversity(defense) {
  // Proxy: number of unique words in defense arguments
  const allText = defense.map(r => r.argument || '').join(' ');
  const words = new Set(allText.toLowerCase().split(/\s+/).filter(w => w.length > 4));
  return Math.min(1, words.size / 50);
}

function scoreCounterArgs(challenge) {
  if (challenge.length === 0) return 0.3;
  const totalLen = challenge.reduce((sum, r) => sum + (r.argument?.length || 0), 0);
  return Math.min(1, totalLen / 800);
}
