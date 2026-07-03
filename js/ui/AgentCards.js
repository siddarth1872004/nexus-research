// ============================================================
// NexusResearch -- Agent Cards UI
// Renders and updates the agent card grid
// ============================================================

import { store } from '../state.js';
import { el, svgIcon, scheduleUpdate, $ } from './renderer.js';
import { AGENT_ICONS } from '../agents/Agent.js';
import { AgentRegistry } from '../agents/AgentRegistry.js';

const STATUS_LABELS = {
  idle: 'Idle',
  assigned: 'Assigned',
  thinking: 'Active',
  debating: 'Debating',
  complete: 'Done',
  error: 'Error',
};

/**
 * Initialize the agent card grid.
 * @param {HTMLElement} container - The .panel__body element
 */
export function initAgentCards(container) {
  const grid = el('div', { className: 'agent-grid', id: 'agent-grid' });
  container.appendChild(grid);

  // Render initial cards
  const configs = AgentRegistry.getAllConfigs();
  for (const cfg of configs) {
    grid.appendChild(_createCard(cfg));
  }

  // Subscribe to agent state changes
  store.subscribe('agents', (agents) => {
    scheduleUpdate(() => _updateCards(agents));
  });
}

function _createCard(cfg) {
  const card = el('div', {
    className: 'agent-card agent-card--idle',
    id: `agent-card-${cfg.id}`,
    style: `--agent-color: ${cfg.colorHex}; --agent-dim: ${cfg.colorHex}26; --agent-glow: ${cfg.colorHex}66;`,
  });

  const header = el('div', { className: 'agent-card__header' },
    el('div', { className: 'agent-card__icon' }, svgIcon(AGENT_ICONS[cfg.id] || '', 14)),
    el('span', { className: 'agent-card__name' }, cfg.name),
  );

  const role = el('div', { className: 'agent-card__role' }, cfg.role);

  const status = el('div', { className: 'agent-card__status', id: `agent-status-${cfg.id}` },
    el('span', { className: 'agent-card__status-dot' }),
    el('span', { className: 'agent-card__status-text' }, 'Idle'),
  );

  card.append(header, role, status);
  return card;
}

function _updateCards(agents) {
  if (!agents) return;

  for (const [id, state] of Object.entries(agents)) {
    const card = $(`#agent-card-${id}`);
    if (!card) continue;

    // Update CSS classes
    card.className = `agent-card agent-card--${state.status || 'idle'}`;
    if (state.active === false) {
      card.classList.add('agent-card--idle');
      card.style.opacity = '0.35';
    } else {
      card.style.opacity = '';
    }

    // Update status
    const statusEl = $(`#agent-status-${id}`);
    if (statusEl) {
      const dotClass = `agent-card__status-dot agent-card__status-dot--${state.status || 'idle'}`;

      if (state.status === 'thinking') {
        statusEl.innerHTML = '';
        const dot = el('span', { className: dotClass });
        const dots = el('div', { className: 'agent-card__thinking-dots' },
          el('span'), el('span'), el('span'),
        );
        const text = el('span', { className: 'agent-card__status-text' }, state.currentTask || 'Thinking...');
        statusEl.append(dot, dots, text);
      } else {
        statusEl.innerHTML = '';
        const dot = el('span', { className: dotClass });
        const text = el('span', { className: 'agent-card__status-text' }, STATUS_LABELS[state.status] || 'Idle');
        statusEl.append(dot, text);
      }
    }
  }
}
