// ============================================================
// NexusResearch -- Activity Feed UI
// Real-time scrolling feed with virtualized rendering
// ============================================================

import { el, svgIcon, scheduleUpdate, $ } from './renderer.js';
import { AGENT_ICONS } from '../agents/Agent.js';
import { AgentRegistry } from '../agents/AgentRegistry.js';
import { formatTime } from '../utils/helpers.js';
import { store } from '../state.js';

const MAX_VISIBLE_ITEMS = 200;

// Agent color lookup
const _colorMap = {};
for (const cfg of AgentRegistry.getAllConfigs()) {
  _colorMap[cfg.id] = cfg.colorHex;
}

let _feedList = null;
let _items = [];
let _filter = 'all';

/**
 * Initialize the activity feed.
 * @param {HTMLElement} container - The .panel__body element
 */
export function initActivityFeed(container) {
  const feed = el('div', { className: 'feed' });

  // Filter bar
  const filterBar = el('div', { className: 'feed__filter-bar' });
  const allBtn = el('button', {
    className: 'feed__filter-btn active',
    dataset: { filter: 'all' },
    onClick: () => _setFilter('all'),
  }, 'All');
  filterBar.appendChild(allBtn);

  for (const cfg of AgentRegistry.getAllConfigs()) {
    const btn = el('button', {
      className: 'feed__filter-btn',
      dataset: { filter: cfg.id },
      onClick: () => _setFilter(cfg.id),
    }, cfg.name);
    filterBar.appendChild(btn);
  }

  // Feed list
  _feedList = el('div', { className: 'feed__list', id: 'feed-list' });

  feed.append(filterBar, _feedList);
  container.appendChild(feed);

  // Subscribe to filter changes
  store.subscribe('ui.feedFilter', (filter) => {
    _filter = filter || 'all';
    _applyFilter();
  });
}

/**
 * Add an item to the activity feed.
 * @param {string} agentId - Agent identifier
 * @param {string} message - Message text
 * @param {string} [phase] - Current pipeline phase name
 */
export function addFeedItem(agentId, message, phase = '') {
  const color = _colorMap[agentId] || '#94a3b8';
  const config = AgentRegistry.getAllConfigs().find(c => c.id === agentId);
  const name = config?.name || agentId;
  const iconPath = AGENT_ICONS[agentId] || '';

  const item = el('div', {
    className: 'feed__item',
    style: `--agent-color: ${color};`,
    dataset: { agent: agentId },
  });

  const icon = el('div', { className: 'feed__item-icon' }, svgIcon(iconPath, 12));
  icon.querySelector('svg')?.setAttribute('stroke', color);

  const body = el('div', { className: 'feed__item-body' });

  const header = el('div', { className: 'feed__item-header' },
    el('span', { className: 'feed__item-agent', style: `color: ${color}` }, name),
  );

  if (phase) {
    header.appendChild(el('span', { className: 'feed__item-phase' }, phase));
  }

  header.appendChild(el('span', { className: 'feed__item-time' }, formatTime()));

  const text = el('div', { className: 'feed__item-text' }, message);

  body.append(header, text);
  item.append(icon, body);

  _items.push({ element: item, agentId });

  // Trim old items
  if (_items.length > MAX_VISIBLE_ITEMS) {
    const removed = _items.shift();
    removed.element.remove();
  }

  // Apply filter
  if (_filter !== 'all' && agentId !== _filter) {
    item.style.display = 'none';
  }

  scheduleUpdate(() => {
    if (_feedList) {
      _feedList.appendChild(item);
      _feedList.scrollTop = _feedList.scrollHeight;
    }
  });
}

/**
 * Clear the activity feed.
 */
export function clearFeed() {
  _items = [];
  if (_feedList) {
    _feedList.innerHTML = '';
  }
}

function _setFilter(filter) {
  _filter = filter;
  store.dispatch('ui.feedFilter', filter);

  // Update button states
  const buttons = document.querySelectorAll('.feed__filter-btn');
  buttons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
  });

  _applyFilter();
}

function _applyFilter() {
  for (const item of _items) {
    if (_filter === 'all' || item.agentId === _filter) {
      item.element.style.display = '';
    } else {
      item.element.style.display = 'none';
    }
  }
}
