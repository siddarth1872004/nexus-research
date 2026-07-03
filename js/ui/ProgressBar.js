// ============================================================
// NexusResearch -- Progress Bar
// 8-phase segmented progress indicator
// ============================================================

import { store } from '../state.js';
import { el, scheduleUpdate } from './renderer.js';

const PHASE_COLORS = [
  '#ffffff', // Decomposition
  '#f4f4f5', // Reconnaissance
  '#e4e4e7', // Deep Research
  '#d4d4d8', // Analysis
  '#a1a1aa', // Debate
  '#ffffff', // Verification
  '#e4e4e7', // Synthesis
  '#d4d4d8', // Polish
];

/**
 * Initialize the progress bar.
 * @param {HTMLElement} container - The .progress-strip element
 */
export function initProgressBar(container) {
  const phases = [
    'Decomposition', 'Reconnaissance', 'Deep Research',
    'Analysis', 'Debate', 'Verification', 'Synthesis', 'Polish',
  ];

  for (let i = 0; i < phases.length; i++) {
    const segment = el('div', {
      className: 'progress-segment',
      id: `progress-phase-${i}`,
      style: `--segment-color: ${PHASE_COLORS[i]}`,
    },
      el('span', { className: 'progress-segment__number' }, String(i + 1)),
      el('span', { className: 'progress-segment__label' }, phases[i]),
      el('div', { className: 'progress-segment__bar' }),
    );
    container.appendChild(segment);
  }

  // Subscribe to pipeline phase changes
  store.subscribe('pipeline.phases', (phases) => {
    scheduleUpdate(() => _updatePhases(phases));
  });
}

function _updatePhases(phases) {
  if (!phases) return;

  for (let i = 0; i < phases.length; i++) {
    const segment = document.getElementById(`progress-phase-${i}`);
    if (!segment) continue;

    // Reset classes
    segment.classList.remove('active', 'complete', 'skipped');

    const status = phases[i].status;
    if (status === 'active') {
      segment.classList.add('active');
    } else if (status === 'complete') {
      segment.classList.add('complete');
    } else if (status === 'skipped') {
      segment.classList.add('complete'); // Dimmed via opacity
      segment.style.opacity = '0.3';
    } else {
      segment.style.opacity = '';
    }
  }
}
