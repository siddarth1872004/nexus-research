// ============================================================
// NexusResearch -- Report View
// Renders the final research report with markdown-to-HTML
// ============================================================

import { store } from '../state.js';
import { markdownToHtml } from '../utils/markdown.js';
import { el, $, scheduleUpdate } from './renderer.js';

let _reportContainer = null;
let _worker = null;
let _pendingCallbackId = 0;
let _callbacks = {};

/**
 * Initialize the report view.
 * @param {HTMLElement} container
 */
export function initReportView(container) {
  _reportContainer = el('div', { className: 'report', id: 'report-content' });

  // Empty state
  const empty = el('div', { className: 'report__empty', id: 'report-empty' },
    el('div', { className: 'report__empty-text' }, 'Research report will appear here once agents complete their analysis.'),
  );
  _reportContainer.appendChild(empty);
  container.appendChild(_reportContainer);

  // Try to initialize web worker
  try {
    _worker = new Worker('./js/workers/markdown.worker.js');
    _worker.onmessage = (e) => {
      const { id, html } = e.data;
      if (_callbacks[id]) {
        _callbacks[id](html);
        delete _callbacks[id];
      }
    };
  } catch {
    _worker = null; // Fallback to main-thread parsing
  }

  // Subscribe to report changes
  store.subscribe('research.reportMarkdown', (markdown) => {
    if (markdown) {
      _renderReport(markdown);
    }
  });
}

/**
 * Render markdown report to HTML.
 * Uses web worker if available, falls back to main thread.
 */
function _renderReport(markdown) {
  if (_worker) {
    const id = ++_pendingCallbackId;
    _callbacks[id] = (html) => {
      scheduleUpdate(() => _updateDOM(html));
      store.dispatch('research.reportHtml', html);
    };
    _worker.postMessage({ id, markdown });
  } else {
    const html = markdownToHtml(markdown);
    scheduleUpdate(() => _updateDOM(html));
    store.dispatch('research.reportHtml', html);
  }
}

function _updateDOM(html) {
  if (!_reportContainer) return;
  _reportContainer.innerHTML = html;
}

/**
 * Get the current report markdown for export.
 */
export function getReportMarkdown() {
  return store.get('research.reportMarkdown') || '';
}

/**
 * Copy report to clipboard as markdown.
 */
export async function copyReport() {
  const md = getReportMarkdown();
  if (md) {
    try {
      await navigator.clipboard.writeText(md);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Download report as a .md file.
 */
export function downloadReport() {
  const md = getReportMarkdown();
  if (!md) return;

  const query = store.get('research.query') || 'research';
  const filename = query.slice(0, 40).replace(/[^a-z0-9]/gi, '_').toLowerCase() + '_report.md';

  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
