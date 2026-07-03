// ============================================================
// NexusResearch -- Modal
// Settings, history, and about modals
// ============================================================

import { el, $, scheduleUpdate } from './renderer.js';
import { store } from '../state.js';
import { Storage } from '../utils/storage.js';
import { validateApiKey } from '../api/gemini.js';

let _overlay = null;

/**
 * Initialize the modal system.
 */
export function initModal() {
  _overlay = el('div', { className: 'modal-overlay', id: 'modal-overlay' });
  _overlay.addEventListener('click', (e) => {
    if (e.target === _overlay) closeModal();
  });
  document.body.appendChild(_overlay);

  // Listen for Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  // Subscribe to modal state
  store.subscribe('ui.modalOpen', (modalName) => {
    if (modalName) {
      _showModal(modalName);
    } else {
      _hideModal();
    }
  });
}

/**
 * Open a modal by name.
 */
export function openModal(name) {
  store.dispatch('ui.modalOpen', name);
}

/**
 * Close the current modal.
 */
export function closeModal() {
  store.dispatch('ui.modalOpen', null);
}

function _showModal(name) {
  if (!_overlay) return;

  let content;
  switch (name) {
    case 'settings':
      content = _buildSettingsModal();
      break;
    case 'history':
      content = _buildHistoryModal();
      break;
    default:
      return;
  }

  scheduleUpdate(() => {
    _overlay.innerHTML = '';
    _overlay.appendChild(content);
    _overlay.classList.add('visible');
  });
}

function _hideModal() {
  if (!_overlay) return;
  scheduleUpdate(() => {
    _overlay.classList.remove('visible');
    setTimeout(() => { if (_overlay) _overlay.innerHTML = ''; }, 300);
  });
}

function _buildSettingsModal() {
  const modal = el('div', { className: 'modal' });

  const header = el('div', { className: 'modal__header' },
    el('h3', { className: 'modal__title' }, 'Settings'),
    el('button', { className: 'btn btn--icon', onClick: closeModal },
      _textNode('X'),
    ),
  );

  const settings = Storage.getSettings();
  const apiKey = Storage.getApiKey();

  const body = el('div', { className: 'modal__body' });

  // API Key
  const apiGroup = el('div', { className: 'form-group' },
    el('label', { className: 'form-label' }, 'Gemini API Key'),
    el('input', {
      className: 'form-input',
      id: 'settings-api-key',
      type: 'password',
      placeholder: 'Enter your Gemini API key...',
      value: apiKey,
    }),
    el('span', { className: 'form-hint', id: 'api-key-status' },
      apiKey ? 'Key configured' : 'Required for research'),
  );

  // Validate button
  const validateBtn = el('button', {
    className: 'btn btn--ghost',
    id: 'validate-key-btn',
    onClick: async () => {
      const input = $('#settings-api-key');
      const status = $('#api-key-status');
      const key = input.value.trim();
      if (!key) { status.textContent = 'Please enter an API key'; return; }

      status.textContent = 'Validating...';
      const valid = await validateApiKey(key);
      if (valid) {
        Storage.setApiKey(key);
        status.textContent = 'Valid -- key saved';
        status.style.color = '#10b981';
      } else {
        status.textContent = 'Invalid API key';
        status.style.color = '#ef4444';
      }
    },
  }, 'Validate & Save');

  // Default Depth
  const depthGroup = el('div', { className: 'form-group' },
    el('label', { className: 'form-label' }, 'Default Research Depth'),
    _buildDepthSelect(settings.depth),
  );

  body.append(apiGroup, validateBtn, depthGroup);

  const footer = el('div', { className: 'modal__footer' },
    el('button', { className: 'btn btn--ghost', onClick: closeModal }, 'Close'),
  );

  modal.append(header, body, footer);
  return modal;
}

function _buildHistoryModal() {
  const modal = el('div', { className: 'modal' });

  const header = el('div', { className: 'modal__header' },
    el('h3', { className: 'modal__title' }, 'Research History'),
    el('button', { className: 'btn btn--icon', onClick: closeModal },
      _textNode('X'),
    ),
  );

  const body = el('div', { className: 'modal__body' });
  const history = Storage.getHistory();

  if (history.length === 0) {
    body.appendChild(el('div', { className: 'empty-state__text' }, 'No research history yet.'));
  } else {
    for (const entry of history) {
      const item = el('div', {
        className: 'claim-card',
        style: 'cursor: pointer;',
        onClick: () => {
          store.batchDispatch({
            'research.reportMarkdown': entry.reportMarkdown || '',
            'research.status': 'complete',
            'ui.view': 'research',
          });
          closeModal();
        },
      },
        el('div', { className: 'claim-card__text' }, entry.query || 'Unknown query'),
        el('div', { className: 'claim-card__meta' },
          el('span', { style: 'font-size: var(--text-xs); color: var(--color-text-muted);' },
            new Date(entry.timestamp).toLocaleString()),
          el('span', { style: 'font-size: var(--text-xs); color: var(--color-text-muted);' },
            entry.depth || 'standard'),
        ),
      );
      body.appendChild(item);
    }
  }

  const footer = el('div', { className: 'modal__footer' },
    el('button', {
      className: 'btn btn--ghost',
      onClick: () => { Storage.clearHistory(); closeModal(); },
    }, 'Clear History'),
    el('button', { className: 'btn btn--ghost', onClick: closeModal }, 'Close'),
  );

  modal.append(header, body, footer);
  return modal;
}

function _buildDepthSelect(current) {
  const select = el('select', {
    className: 'form-input',
    onChange: (e) => {
      const settings = Storage.getSettings();
      settings.depth = e.target.value;
      Storage.setSettings(settings);
    },
  });

  const options = ['quick', 'standard', 'deep', 'exhaustive'];
  for (const opt of options) {
    const option = el('option', { value: opt }, opt.charAt(0).toUpperCase() + opt.slice(1));
    if (opt === current) option.selected = true;
    select.appendChild(option);
  }

  return select;
}

function _textNode(text) {
  return document.createTextNode(text);
}
