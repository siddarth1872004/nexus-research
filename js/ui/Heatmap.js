// ============================================================
// NexusResearch -- Heatmap
// Confidence heatmap for claim visualization
// ============================================================

import { el, scheduleUpdate } from './renderer.js';
import { AgentRegistry } from '../agents/AgentRegistry.js';

const _colorMap = {};
for (const cfg of AgentRegistry.getAllConfigs()) {
  _colorMap[cfg.id] = cfg.colorHex;
}

let _container = null;

/**
 * Initialize the heatmap view.
 * @param {HTMLElement} container
 */
export function initHeatmap(container) {
  _container = el('div', { className: 'tab-content', id: 'claims-tab' });
  container.appendChild(_container);
}

/**
 * Render claims as a confidence heatmap grid.
 * @param {Array} claims - Array of claim objects from ClaimLedger
 */
export function renderHeatmap(claims) {
  if (!_container) return;

  scheduleUpdate(() => {
    _container.innerHTML = '';

    if (!claims || claims.length === 0) {
      _container.appendChild(
        el('div', { className: 'empty-state' },
          el('div', { className: 'empty-state__text' }, 'Claims will appear here as agents verify findings. Each claim shows a confidence score.')
        )
      );
      return;
    }

    // Header with legend
    const header = el('div', { className: 'heatmap__header' },
      el('span', { className: 'heatmap__title' }, `${claims.length} Claims`),
      el('div', { className: 'heatmap__legend' },
        el('span', {}, 'Low'),
        el('div', { className: 'heatmap__legend-bar' }),
        el('span', {}, 'High'),
      ),
    );

    const grid = el('div', { className: 'claim-grid' });

    for (const claim of claims) {
      grid.appendChild(_createClaimCard(claim));
    }

    _container.append(header, grid);
  });
}

function _createClaimCard(claim) {
  const card = el('div', { className: 'claim-card' });

  const text = el('div', { className: 'claim-card__text' }, claim.text);

  // Agent dots
  const agentDots = el('div', { className: 'claim-card__agents' });
  for (const agentId of (claim.contributingAgents || [])) {
    const dot = el('span', {
      className: 'claim-card__agent-dot',
      style: `background: ${_colorMap[agentId] || '#94a3b8'}`,
      title: agentId,
    });
    agentDots.appendChild(dot);
  }

  // Confidence
  const conf = claim.confidence || 0;
  const confLevel = conf >= 70 ? 'high' : conf >= 40 ? 'medium' : 'low';
  const confColor = conf >= 70 ? '#10b981' : conf >= 40 ? '#f59e0b' : '#ef4444';

  const confBar = el('div', { className: 'claim-card__confidence-bar' },
    el('div', {
      className: `claim-card__confidence-fill claim-card__confidence-fill--${confLevel}`,
      style: `width: ${conf}%`,
    }),
  );

  const meta = el('div', { className: 'claim-card__meta' },
    agentDots,
    el('span', {
      className: 'claim-card__confidence-value',
      style: `color: ${confColor}`,
    }, `${conf}%`),
  );

  card.append(text, confBar, meta);
  return card;
}
