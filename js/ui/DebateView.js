// ============================================================
// NexusResearch -- Debate View
// Interactive debate thread visualization
// ============================================================

import { el, scheduleUpdate } from './renderer.js';
import { AgentRegistry } from '../agents/AgentRegistry.js';

const _colorMap = {};
for (const cfg of AgentRegistry.getAllConfigs()) {
  _colorMap[cfg.id] = cfg.colorHex;
}

let _container = null;

/**
 * Initialize the debate view.
 * @param {HTMLElement} container
 */
export function initDebateView(container) {
  _container = el('div', { className: 'tab-content', id: 'debates-tab' });
  container.appendChild(_container);
}

/**
 * Render debate threads.
 * @param {Array} debates - Array of debate objects from DebateEngine
 */
export function renderDebates(debates) {
  if (!_container) return;

  scheduleUpdate(() => {
    _container.innerHTML = '';

    if (!debates || debates.length === 0) {
      _container.appendChild(
        el('div', { className: 'empty-state' },
          el('div', { className: 'empty-state__text' }, 'No debates have been initiated yet. Debates occur when the Devils Advocate or Bias Detector challenges findings.')
        )
      );
      return;
    }

    for (const debate of debates) {
      _container.appendChild(_createDebateThread(debate));
    }
  });
}

function _createDebateThread(debate) {
  const thread = el('div', { className: 'debate-thread' });

  // Claim header
  const claim = el('div', { className: 'debate-thread__claim' }, `Claim: "${debate.claimText}"`);
  thread.appendChild(claim);

  // Rounds
  for (const round of debate.rounds) {
    const agentConfig = AgentRegistry.getAllConfigs().find(c => c.id === round.agentId);
    const name = agentConfig?.name || round.agentId;
    const color = _colorMap[round.agentId] || '#94a3b8';

    const roundEl = el('div', { className: 'debate-round' },
      el('span', { className: 'debate-round__agent', style: `color: ${color}` }, name),
      el('div', { className: 'debate-round__text' }, round.argument),
    );
    thread.appendChild(roundEl);
  }

  // Resolution
  if (debate.status === 'resolved') {
    const confColor = debate.finalConfidence >= 70 ? '#10b981' : debate.finalConfidence >= 40 ? '#f59e0b' : '#ef4444';
    const resolution = el('div', { className: 'debate-thread__resolution' },
      el('span', { className: 'debate-thread__resolution-label' }, `Resolution: ${debate.resolution}`),
      el('span', { className: 'debate-thread__confidence', style: `color: ${confColor}` }, `${debate.finalConfidence}%`),
    );
    thread.appendChild(resolution);
  }

  return thread;
}
