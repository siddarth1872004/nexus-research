// ============================================================
// NexusResearch -- DOM Renderer
// Core DOM manipulation utilities with batched updates
// ============================================================

/**
 * Lightweight DOM helper with requestAnimationFrame batching.
 * All DOM mutations are queued and flushed once per frame.
 */

const _pendingUpdates = [];
let _rafScheduled = false;

/**
 * Schedule a DOM update for the next animation frame.
 * @param {Function} updateFn - Function that performs DOM mutations
 */
export function scheduleUpdate(updateFn) {
  _pendingUpdates.push(updateFn);
  if (!_rafScheduled) {
    _rafScheduled = true;
    requestAnimationFrame(_flushUpdates);
  }
}

function _flushUpdates() {
  _rafScheduled = false;
  const updates = _pendingUpdates.splice(0);
  for (const fn of updates) {
    try { fn(); } catch (e) { console.error('[Renderer] Update error:', e); }
  }
}

/**
 * Create an element with attributes and children.
 * @param {string} tag
 * @param {Object} [attrs]
 * @param  {...(string|Node)} children
 * @returns {HTMLElement}
 */
export function el(tag, attrs = {}, ...children) {
  const element = document.createElement(tag);

  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'className') {
      element.className = value;
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(element.style, value);
    } else if (key.startsWith('on') && typeof value === 'function') {
      element.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'dataset' && typeof value === 'object') {
      for (const [dk, dv] of Object.entries(value)) {
        element.dataset[dk] = dv;
      }
    } else {
      element.setAttribute(key, value);
    }
  }

  for (const child of children) {
    if (typeof child === 'string') {
      element.appendChild(document.createTextNode(child));
    } else if (child instanceof Node) {
      element.appendChild(child);
    }
  }

  return element;
}

/**
 * Create an SVG element with a path.
 * @param {string} pathD - SVG path data
 * @param {number} [size=24] - Width/height
 * @returns {SVGElement}
 */
export function svgIcon(pathD, size = 24) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', pathD);
  svg.appendChild(path);
  return svg;
}

/**
 * Clear all children from an element.
 */
export function clearChildren(element) {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

/**
 * Query helper
 */
export function $(selector, root = document) {
  return root.querySelector(selector);
}

export function $$(selector, root = document) {
  return [...root.querySelectorAll(selector)];
}
