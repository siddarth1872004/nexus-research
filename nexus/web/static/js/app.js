// ============================================================
// NexusResearch -- AMOLED WebSocket Client & UI Manager
// ============================================================

let ws = null;
let selectedDepth = 'standard';
let activeAgents = new Set();
let agentStatuses = {};

const AGENT_NAMES = {
  director: 'Director', strategist: 'Strategist', scout: 'Scout',
  deepdiver: 'Deep Diver', crossreferencer: 'Cross-Ref', pattern: 'Pattern Analyst',
  devil: 'Devils Advocate', quantifier: 'Quantifier', bias: 'Bias Detector',
  factcheck: 'Fact Checker', synthesizer: 'Synthesizer', visualizer: 'Visualizer', editor: 'Editor'
};

document.addEventListener('DOMContentLoaded', () => {
  initWebSocket();
  initEvents();
  checkSettings();
});

function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleWsEvent(msg.type, msg.data);
    } catch (e) {
      console.error('WS Error:', e);
    }
  };

  ws.onclose = () => {
    setTimeout(initWebSocket, 2000);
  };
}

function handleWsEvent(type, data) {
  if (type === 'start') {
    activeAgents = new Set(data.activeAgents || []);
    renderAgentCards();
    showResearchView();
  } else if (type === 'phase') {
    updatePhase(data.index, data.status);
  } else if (type === 'feed') {
    addFeedItem(data.agentId, data.message, data.phase);
    updateAgentStatus(data.agentId, 'thinking', data.message);
  } else if (type === 'complete') {
    renderReport(data.reportMarkdown);
    resetAgentStatuses('complete');
  } else if (type === 'error') {
    addFeedItem('director', `Error: ${data.error}`, 'Error');
    resetAgentStatuses('error');
  }
}

function initEvents() {
  document.querySelectorAll('.depth-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.depth-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedDepth = btn.dataset.depth;
    });
  });

  document.getElementById('start-btn').addEventListener('click', startResearch);
  document.getElementById('new-btn').addEventListener('click', showLanding);
  document.getElementById('settings-btn').addEventListener('click', toggleModal);
  document.getElementById('save-settings-btn').addEventListener('click', saveSettings);
}

async function checkSettings() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    if (!data.hasKey) toggleModal(true);
  } catch (e) {}
}

async function saveSettings() {
  const key = document.getElementById('api-key-input').value.trim();
  if (key) {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gemini_api_key: key })
    });
    toggleModal(false);
  }
}

function toggleModal(show) {
  const modal = document.getElementById('modal-overlay');
  modal.classList.toggle('visible', show !== undefined ? show : !modal.classList.contains('visible'));
}

async function startResearch() {
  const query = document.getElementById('research-input').value.trim();
  if (!query) return;

  document.getElementById('feed-list').innerHTML = '';
  document.getElementById('report-content').innerHTML = 'Generating report...';

  await fetch('/api/research', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, depth: selectedDepth })
  });
}

function showResearchView() {
  document.getElementById('landing-view').style.display = 'none';
  document.getElementById('research-view').style.display = '';
  document.getElementById('new-btn').style.display = '';
}

function showLanding() {
  document.getElementById('landing-view').style.display = '';
  document.getElementById('research-view').style.display = 'none';
  document.getElementById('new-btn').style.display = 'none';
}

function renderAgentCards() {
  const body = document.getElementById('agents-body');
  body.innerHTML = '';

  const grid = document.createElement('div');
  grid.className = 'agent-grid';

  for (const [id, name] of Object.entries(AGENT_NAMES)) {
    const isActive = activeAgents.has(id);
    const card = document.createElement('div');
    card.className = `agent-card ${isActive ? 'agent-card--idle' : ''}`;
    card.id = `card-${id}`;
    if (!isActive) card.style.opacity = '0.3';

    card.innerHTML = `
      <div class="agent-card__name">${name}</div>
      <div class="agent-card__role">${id}</div>
      <div class="agent-card__status-text" id="status-${id}">${isActive ? 'Idle' : 'Inactive'}</div>
    `;
    grid.appendChild(card);
  }
  body.appendChild(grid);
}

function updateAgentStatus(agentId, status, task) {
  const card = document.getElementById(`card-${agentId}`);
  const statusEl = document.getElementById(`status-${agentId}`);
  if (card && statusEl) {
    card.className = `agent-card agent-card--${status}`;
    statusEl.textContent = status === 'thinking' ? (task.slice(0, 20) + '...') : status;
  }
}

function resetAgentStatuses(status) {
  for (const id of activeAgents) {
    updateAgentStatus(id, status, '');
  }
}

function addFeedItem(agentId, message, phase) {
  const list = document.getElementById('feed-list');
  const item = document.createElement('div');
  item.className = 'feed__item';
  item.innerHTML = `
    <div>
      <div><span class="feed__item-agent">${AGENT_NAMES[agentId] || agentId}</span> <span class="feed__item-phase">${phase}</span></div>
      <div class="feed__item-text">${escapeHtml(message)}</div>
    </div>
  `;
  list.appendChild(item);
  list.scrollTop = list.scrollHeight;
}

function updatePhase(index, status) {
  const el = document.getElementById(`phase-${index}`);
  if (el) {
    el.className = `progress-segment ${status}`;
  }
}

function renderReport(md) {
  const container = document.getElementById('report-content');
  container.innerHTML = parseSimpleMarkdown(md);
}

function parseSimpleMarkdown(md) {
  if (!md) return '';
  let html = md.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>');
  html = html.replace(/## (.*?)(<br>|<\/p>)/g, '<h2>$1</h2>');
  html = html.replace(/### (.*?)(<br>|<\/p>)/g, '### $1');
  return `<p>${html}</p>`;
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
