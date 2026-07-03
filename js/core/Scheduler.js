// ============================================================
// NexusResearch -- Scheduler
// DAG-based wave scheduler for parallel agent execution
// ============================================================

/**
 * Models the research pipeline as a DAG of tasks.
 * Groups independent tasks into parallel "waves" and executes
 * them via Promise.allSettled for maximum throughput.
 *
 * Supports streaming overlap: downstream tasks can start before
 * upstream tasks fully complete, when partial data is available.
 */

export class Scheduler {
  constructor() {
    this._nodes = new Map();    // id -> { id, fn, deps, status, result, error }
    this._listeners = new Set();
    this._abortController = null;
  }

  /**
   * Add a task node to the DAG.
   * @param {string} id            - Unique task identifier
   * @param {Function} fn          - Async function to execute. Receives { signal, getResult }
   * @param {string[]} [deps=[]]   - IDs of tasks this depends on
   */
  addNode(id, fn, deps = []) {
    this._nodes.set(id, {
      id,
      fn,
      deps,
      status: 'pending',      // pending | running | complete | failed | skipped
      result: null,
      error: null,
    });
  }

  /**
   * Execute the DAG. Runs tasks in topological waves.
   * @returns {Promise<Map>} Results map { id -> result }
   */
  async execute() {
    this._abortController = new AbortController();
    const signal = this._abortController.signal;
    const results = new Map();

    const getResult = (id) => {
      const node = this._nodes.get(id);
      return node ? node.result : undefined;
    };

    while (true) {
      if (signal.aborted) break;

      // Find all nodes that are pending and have all deps complete
      const ready = [];
      let hasPending = false;

      for (const node of this._nodes.values()) {
        if (node.status === 'pending') {
          hasPending = true;
          const depsOk = node.deps.every(depId => {
            const dep = this._nodes.get(depId);
            return dep && (dep.status === 'complete' || dep.status === 'failed');
          });
          if (depsOk) ready.push(node);
        }
      }

      if (ready.length === 0) {
        if (!hasPending) break; // All done
        // Deadlock detection: pending nodes exist but none are ready
        console.warn('[Scheduler] Potential deadlock: pending tasks with unresolvable deps');
        break;
      }

      // Execute this wave in parallel
      this._emit('wave-start', ready.map(n => n.id));

      const promises = ready.map(async (node) => {
        node.status = 'running';
        this._emit('task-start', node.id);

        try {
          node.result = await node.fn({ signal, getResult });
          node.status = 'complete';
          results.set(node.id, node.result);
          this._emit('task-complete', node.id, node.result);
        } catch (err) {
          if (signal.aborted) {
            node.status = 'skipped';
          } else {
            node.status = 'failed';
            node.error = err;
            console.error(`[Scheduler] Task "${node.id}" failed:`, err);
          }
          this._emit('task-error', node.id, err);
        }
      });

      await Promise.allSettled(promises);
      this._emit('wave-complete', ready.map(n => n.id));
    }

    this._emit('complete', results);
    return results;
  }

  /**
   * Abort all running and pending tasks.
   */
  abort() {
    if (this._abortController) {
      this._abortController.abort();
    }
    for (const node of this._nodes.values()) {
      if (node.status === 'pending' || node.status === 'running') {
        node.status = 'skipped';
      }
    }
    this._emit('aborted');
  }

  /**
   * Reset all nodes to pending.
   */
  reset() {
    for (const node of this._nodes.values()) {
      node.status = 'pending';
      node.result = null;
      node.error = null;
    }
  }

  /** Clear all nodes */
  clear() {
    this._nodes.clear();
  }

  /** Get node by ID */
  getNode(id) { return this._nodes.get(id) || null; }

  /** Get all nodes */
  getNodes() { return [...this._nodes.values()]; }

  /** Subscribe to scheduler events */
  on(callback) {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  _emit(event, ...args) {
    for (const cb of this._listeners) {
      try { cb(event, ...args); } catch (e) { console.error('[Scheduler]', e); }
    }
  }
}
