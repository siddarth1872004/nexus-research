// ============================================================
// NexusResearch -- Topology Visualization
// Canvas-based force-directed agent network graph
// 30fps, dirty-region rendering, object pooling
// ============================================================

import { store } from '../state.js';
import { AgentRegistry } from '../agents/AgentRegistry.js';

const TIER_Y = { command: 0.2, research: 0.4, analysis: 0.65, output: 0.85 };
const NODE_RADIUS = 18;
const LABEL_OFFSET = 28;

/**
 * Initialize the topology canvas.
 * @param {HTMLElement} container - The .panel__body element
 */
export function initTopology(container) {
  const canvas = document.createElement('canvas');
  canvas.className = 'topology__canvas';
  canvas.id = 'topology-canvas';
  container.appendChild(canvas);

  // Tooltip
  const tooltip = document.createElement('div');
  tooltip.className = 'topology__tooltip';
  tooltip.id = 'topology-tooltip';
  tooltip.innerHTML = '<div class="topology__tooltip-name"></div><div class="topology__tooltip-role"></div><div class="topology__tooltip-status"></div>';
  container.appendChild(tooltip);

  const state = {
    canvas,
    ctx: canvas.getContext('2d'),
    tooltip,
    nodes: [],
    edges: [],
    dirty: true,
    animFrame: null,
    hoveredNode: null,
    width: 0,
    height: 0,
    dpr: window.devicePixelRatio || 1,
    frameCount: 0,
  };

  _initNodes(state);
  _initEdges(state);
  _resize(state);

  // Resize observer
  const ro = new ResizeObserver(() => {
    _resize(state);
    state.dirty = true;
  });
  ro.observe(container);

  // Mouse events for tooltip
  canvas.addEventListener('mousemove', (e) => _onMouseMove(state, e));
  canvas.addEventListener('mouseleave', () => _onMouseLeave(state));

  // Subscribe to agent state changes
  store.subscribe('agents', () => {
    state.dirty = true;
  });

  // Render loop at ~30fps
  let lastFrame = 0;
  function loop(timestamp) {
    state.animFrame = requestAnimationFrame(loop);
    if (timestamp - lastFrame < 33) return; // ~30fps cap
    lastFrame = timestamp;

    if (state.dirty) {
      state.dirty = false;
      state.frameCount++;
      _render(state);
    }
  }
  state.animFrame = requestAnimationFrame(loop);

  return {
    destroy() {
      cancelAnimationFrame(state.animFrame);
      ro.disconnect();
    },
    markDirty() { state.dirty = true; },
  };
}

function _initNodes(state) {
  const configs = AgentRegistry.getAllConfigs();
  const tierGroups = {};

  for (const cfg of configs) {
    if (!tierGroups[cfg.tier]) tierGroups[cfg.tier] = [];
    tierGroups[cfg.tier].push(cfg);
  }

  for (const [tier, agents] of Object.entries(tierGroups)) {
    const y = TIER_Y[tier] || 0.5;
    const count = agents.length;
    agents.forEach((cfg, i) => {
      const x = (i + 1) / (count + 1);
      state.nodes.push({
        id: cfg.id,
        name: cfg.name,
        role: cfg.role,
        tier: cfg.tier,
        color: cfg.colorHex,
        x, y,
        status: 'idle',
        active: false,
      });
    });
  }
}

function _initEdges(state) {
  // Define connections based on data flow
  const connections = [
    ['director', 'scout'],
    ['director', 'strategist'],
    ['strategist', 'deepdiver'],
    ['scout', 'pattern'],
    ['scout', 'deepdiver'],
    ['deepdiver', 'crossreferencer'],
    ['deepdiver', 'pattern'],
    ['crossreferencer', 'pattern'],
    ['pattern', 'devil'],
    ['pattern', 'quantifier'],
    ['devil', 'factcheck'],
    ['quantifier', 'factcheck'],
    ['bias', 'factcheck'],
    ['factcheck', 'synthesizer'],
    ['synthesizer', 'editor'],
    ['synthesizer', 'visualizer'],
    ['editor', 'visualizer'],
  ];

  for (const [from, to] of connections) {
    state.edges.push({ from, to, active: false });
  }
}

function _resize(state) {
  const rect = state.canvas.parentElement.getBoundingClientRect();
  state.width = rect.width;
  state.height = rect.height;
  state.canvas.width = rect.width * state.dpr;
  state.canvas.height = rect.height * state.dpr;
  state.canvas.style.width = rect.width + 'px';
  state.canvas.style.height = rect.height + 'px';
  state.ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
}

function _render(state) {
  const { ctx, width, height, nodes, edges, frameCount } = state;
  const agents = store.get('agents') || {};

  // Update node states
  for (const node of nodes) {
    const agentState = agents[node.id];
    if (agentState) {
      node.status = agentState.status || 'idle';
      node.active = agentState.active !== false;
    }
  }

  // Clear
  ctx.clearRect(0, 0, width, height);

  // Draw subtle grid pattern
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
  }
  for (let y = 0; y < height; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
  }

  // Draw tier labels
  ctx.font = '10px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.textAlign = 'left';
  const tiers = { command: 'COMMAND', research: 'RESEARCH', analysis: 'ANALYSIS', output: 'OUTPUT' };
  for (const [tier, label] of Object.entries(tiers)) {
    ctx.fillText(label, 8, TIER_Y[tier] * height - 10);
  }

  // Draw edges
  for (const edge of edges) {
    const fromNode = nodes.find(n => n.id === edge.from);
    const toNode = nodes.find(n => n.id === edge.to);
    if (!fromNode || !toNode) continue;

    const x1 = fromNode.x * width;
    const y1 = fromNode.y * height;
    const x2 = toNode.x * width;
    const y2 = toNode.y * height;

    const isActive = fromNode.status === 'thinking' || toNode.status === 'thinking';

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);

    if (isActive) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.lineDashOffset = -frameCount * 0.5;
    } else {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
    }

    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Draw nodes
  for (const node of nodes) {
    const x = node.x * width;
    const y = node.y * height;
    const isThinking = node.status === 'thinking';
    const isComplete = node.status === 'complete';
    const isActive = node.active;

    // Glow for thinking nodes
    if (isThinking) {
      const glowRadius = NODE_RADIUS + 8 + Math.sin(frameCount * 0.08) * 4;
      const gradient = ctx.createRadialGradient(x, y, NODE_RADIUS, x, y, glowRadius);
      gradient.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Node circle
    ctx.beginPath();
    ctx.arc(x, y, NODE_RADIUS, 0, Math.PI * 2);

    if (!isActive) {
      ctx.fillStyle = '#000000';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    } else if (isThinking) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.strokeStyle = '#ffffff';
    } else if (isComplete) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    } else {
      ctx.fillStyle = '#121215';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    }

    ctx.lineWidth = isThinking ? 2.5 : 1.5;
    ctx.fill();
    ctx.stroke();

    // Node label
    ctx.font = `500 10px system-ui, sans-serif`;
    ctx.fillStyle = isActive ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 255, 255, 0.3)';
    ctx.textAlign = 'center';
    ctx.fillText(node.name, x, y + LABEL_OFFSET);

    // Status indicator dot
    if (isActive) {
      const dotColor = isThinking ? '#ffffff' : isComplete ? '#e4e4e7' : '#a1a1aa';
      ctx.beginPath();
      ctx.arc(x + NODE_RADIUS - 2, y - NODE_RADIUS + 2, 4, 0, Math.PI * 2);
      ctx.fillStyle = dotColor;
      ctx.fill();
    }
  }
}

function _onMouseMove(state, e) {
  const rect = state.canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  let hovered = null;
  for (const node of state.nodes) {
    const nx = node.x * state.width;
    const ny = node.y * state.height;
    const dist = Math.hypot(mx - nx, my - ny);
    if (dist < NODE_RADIUS + 4) {
      hovered = node;
      break;
    }
  }

  if (hovered !== state.hoveredNode) {
    state.hoveredNode = hovered;
    const tooltip = state.tooltip;

    if (hovered) {
      tooltip.querySelector('.topology__tooltip-name').textContent = hovered.name;
      tooltip.querySelector('.topology__tooltip-role').textContent = hovered.role;
      tooltip.querySelector('.topology__tooltip-status').textContent = `Status: ${hovered.status}`;
      tooltip.style.left = (hovered.x * state.width + 24) + 'px';
      tooltip.style.top = (hovered.y * state.height - 20) + 'px';
      tooltip.classList.add('visible');
    } else {
      tooltip.classList.remove('visible');
    }
  }
}

function _onMouseLeave(state) {
  state.hoveredNode = null;
  state.tooltip.classList.remove('visible');
}
