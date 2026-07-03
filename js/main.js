// ============================================================
// NexusResearch -- Main Entry Point
// Application initialization and global orchestration
// ============================================================

import { store } from './state.js';
import { Storage } from './utils/storage.js';
import { AgentRegistry } from './agents/AgentRegistry.js';
import { Pipeline } from './core/Pipeline.js';

import { initAgentCards } from './ui/AgentCards.js';
import { initTopology } from './ui/Topology.js';
import { initActivityFeed, addFeedItem, clearFeed } from './ui/ActivityFeed.js';
import { initReportView, copyReport, downloadReport } from './ui/ReportView.js';
import { initProgressBar } from './ui/ProgressBar.js';
import { initDebateView, renderDebates } from './ui/DebateView.js';
import { initHeatmap, renderHeatmap } from './ui/Heatmap.js';
import { initModal, openModal } from './ui/Modal.js';
import { el, $, svgIcon } from './ui/renderer.js';

// ---- Globals ----
let registry;
let pipeline;
let topology;

// ---- Initialization ----

document.addEventListener('DOMContentLoaded', () => {
  registry = new AgentRegistry();
  pipeline = new Pipeline(registry);

  // Connect pipeline feed to UI
  pipeline.onFeedMessage((agentId, message, phase) => {
    addFeedItem(agentId, message, phase);
  });

  _initUI();
  _bindEvents();

  // Check for API key
  const apiKey = Storage.getApiKey();
  if (!apiKey) {
    setTimeout(() => openModal('settings'), 500);
  }
});

function _initUI() {
  // Progress bar
  initProgressBar($('.progress-strip'));

  // Modal system
  initModal();
}

function _bindEvents() {
  // Settings button
  const settingsBtn = $('#settings-btn');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => openModal('settings'));
  }

  // History button
  const historyBtn = $('#history-btn');
  if (historyBtn) {
    historyBtn.addEventListener('click', () => openModal('history'));
  }

  // Start research button
  const startBtn = $('#start-research-btn');
  if (startBtn) {
    startBtn.addEventListener('click', _startResearch);
  }

  // Textarea enter key (Ctrl+Enter to submit)
  const textarea = $('#research-input');
  if (textarea) {
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        _startResearch();
      }
    });
  }

  // Depth buttons
  const depthBtns = document.querySelectorAll('.depth-btn');
  depthBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      depthBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Abort button
  const abortBtn = $('#abort-btn');
  if (abortBtn) {
    abortBtn.addEventListener('click', _abortResearch);
  }

  // Export buttons
  const copyBtn = $('#copy-report-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const success = await copyReport();
      _showToast(success ? 'Report copied to clipboard' : 'Failed to copy', success ? 'success' : 'error');
    });
  }

  const downloadBtn = $('#download-report-btn');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', downloadReport);
  }

  // Tab switching
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
      const target = document.getElementById(`${tab}-tab`);
      if (target) target.classList.add('active');

      store.dispatch('ui.activeTab', tab);
    });
  });

  // New research button
  const newBtn = $('#new-research-btn');
  if (newBtn) {
    newBtn.addEventListener('click', _showLanding);
  }
}

async function _startResearch() {
  const textarea = $('#research-input');
  const query = textarea?.value?.trim();
  if (!query) return;

  const apiKey = Storage.getApiKey();
  if (!apiKey) {
    openModal('settings');
    return;
  }

  // Get selected depth
  const activeDepthBtn = document.querySelector('.depth-btn.active');
  const depth = activeDepthBtn?.dataset?.depth || 'standard';

  // Switch to research view
  _showResearchView();

  // Initialize UI panels
  const topologyPanel = $('#topology-body');
  const agentsPanel = $('#agents-body');
  const feedPanel = $('#feed-body');
  const reportPanel = $('#report-body');

  // Clear previous
  if (topologyPanel) topologyPanel.innerHTML = '';
  if (agentsPanel) agentsPanel.innerHTML = '';
  if (feedPanel) feedPanel.innerHTML = '';
  if (reportPanel) reportPanel.innerHTML = '';

  clearFeed();

  // Init panels
  if (topologyPanel) topology = initTopology(topologyPanel);
  if (agentsPanel) initAgentCards(agentsPanel);
  if (feedPanel) initActivityFeed(feedPanel);

  // Report panel with tabs
  if (reportPanel) {
    const tabBar = el('div', { className: 'tab-bar' },
      el('button', { className: 'tab-btn active', dataset: { tab: 'report' }, onClick: () => _switchTab('report') }, 'Report'),
      el('button', { className: 'tab-btn', dataset: { tab: 'debates' }, onClick: () => _switchTab('debates') }, 'Debates'),
      el('button', { className: 'tab-btn', dataset: { tab: 'claims' }, onClick: () => _switchTab('claims') }, 'Claims'),
    );
    reportPanel.appendChild(tabBar);

    const reportTab = el('div', { className: 'tab-content active', id: 'report-tab' });
    reportPanel.appendChild(reportTab);
    initReportView(reportTab);
    initDebateView(reportPanel);
    initHeatmap(reportPanel);
  }

  // Add initial feed message
  addFeedItem('director', `Starting research: "${query}" [Depth: ${depth}]`, 'Init');

  // Run the pipeline
  try {
    const report = await pipeline.start(query, depth);

    // Update tabs with debate/claim data
    if (pipeline.debateEngine) {
      renderDebates(pipeline.debateEngine.getAll());
    }
    if (pipeline.claimLedger) {
      renderHeatmap(pipeline.claimLedger.getSorted());
    }

    // Save to history
    Storage.addHistory({
      id: Date.now().toString(36),
      query,
      depth,
      timestamp: Date.now(),
      reportMarkdown: report,
    });

    // Enable export buttons
    const copyBtn = $('#copy-report-btn');
    const downloadBtn = $('#download-report-btn');
    if (copyBtn) copyBtn.disabled = false;
    if (downloadBtn) downloadBtn.disabled = false;

    _showToast('Research complete', 'success');
  } catch (err) {
    if (err.message !== 'Aborted' && err.message !== 'Request aborted') {
      _showToast(`Research failed: ${err.message}`, 'error');
      console.error('[Pipeline Error]', err);
    }
  }
}

function _abortResearch() {
  if (pipeline) {
    pipeline.abort();
    addFeedItem('director', 'Research aborted by user', 'Abort');
    _showToast('Research aborted', 'info');
  }
}

function _showResearchView() {
  const landing = $('#landing-view');
  const research = $('#research-view');
  const abortBtn = $('#abort-btn');
  const newBtn = $('#new-research-btn');

  if (landing) landing.style.display = 'none';
  if (research) research.style.display = '';
  if (abortBtn) abortBtn.style.display = '';
  if (newBtn) newBtn.style.display = '';

  store.dispatch('ui.view', 'research');
}

function _showLanding() {
  const landing = $('#landing-view');
  const research = $('#research-view');
  const abortBtn = $('#abort-btn');
  const newBtn = $('#new-research-btn');

  if (landing) landing.style.display = '';
  if (research) research.style.display = 'none';
  if (abortBtn) abortBtn.style.display = 'none';
  if (newBtn) newBtn.style.display = 'none';

  // Reset pipeline phases
  store.dispatch('pipeline.phases', []);
  store.dispatch('pipeline.currentPhase', null);
  store.dispatch('research.status', 'idle');

  registry.resetAll();
}

function _switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tabName);
  });
  document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
  const target = document.getElementById(`${tabName}-tab`);
  if (target) target.classList.add('active');
}

function _showToast(message, type = 'info') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = el('div', { className: `toast toast--${type}` }, message);
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('visible');
  });

  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
