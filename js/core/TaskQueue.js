// ============================================================
// NexusResearch -- TaskQueue
// Priority queue with dependency resolution
// ============================================================

import { uid } from '../utils/helpers.js';

/**
 * Task states: pending -> assigned -> running -> complete | failed
 * Priority: 1 (highest) to 5 (lowest)
 */

export class TaskQueue {
  constructor() {
    this._tasks = new Map();
    this._listeners = new Set();
  }

  /**
   * Add a task to the queue.
   * @param {Object} taskDef
   * @param {string} taskDef.description
   * @param {number} [taskDef.priority=3]    - 1 (highest) to 5
   * @param {string[]} [taskDef.dependencies] - IDs of tasks that must complete first
   * @param {string} [taskDef.agentType]      - Preferred agent type
   * @returns {Object} The created task
   */
  enqueue(taskDef) {
    const task = {
      id: uid(),
      description: taskDef.description,
      priority: taskDef.priority || 3,
      dependencies: taskDef.dependencies || [],
      agentType: taskDef.agentType || null,
      assignedAgent: null,
      status: 'pending',
      result: null,
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
    };
    this._tasks.set(task.id, task);
    this._emit('enqueue', task);
    return task;
  }

  /**
   * Dequeue the highest-priority task whose dependencies are all resolved.
   * Returns null if no task is available.
   */
  dequeue(agentType = null) {
    let best = null;
    for (const task of this._tasks.values()) {
      if (task.status !== 'pending') continue;
      if (agentType && task.agentType && task.agentType !== agentType) continue;
      if (!this._depsResolved(task)) continue;
      if (!best || task.priority < best.priority) {
        best = task;
      }
    }
    return best;
  }

  /**
   * Assign a task to an agent.
   */
  assign(taskId, agentId) {
    const task = this._tasks.get(taskId);
    if (!task) return null;
    task.status = 'assigned';
    task.assignedAgent = agentId;
    task.startedAt = Date.now();
    this._emit('assign', task);
    return task;
  }

  /**
   * Mark a task as running.
   */
  markRunning(taskId) {
    const task = this._tasks.get(taskId);
    if (!task) return;
    task.status = 'running';
    this._emit('running', task);
  }

  /**
   * Mark a task as complete with a result.
   */
  markComplete(taskId, result = null) {
    const task = this._tasks.get(taskId);
    if (!task) return;
    task.status = 'complete';
    task.result = result;
    task.completedAt = Date.now();
    this._emit('complete', task);
  }

  /**
   * Mark a task as failed.
   */
  markFailed(taskId, error = null) {
    const task = this._tasks.get(taskId);
    if (!task) return;
    task.status = 'failed';
    task.result = error;
    task.completedAt = Date.now();
    this._emit('failed', task);
  }

  /** Get all tasks */
  getAll() { return [...this._tasks.values()]; }

  /** Get tasks by status */
  getByStatus(status) {
    return [...this._tasks.values()].filter(t => t.status === status);
  }

  /** Get pending count */
  get pendingCount() {
    return [...this._tasks.values()].filter(t => t.status === 'pending').length;
  }

  /** Check if all tasks are resolved (complete or failed) */
  get allResolved() {
    for (const task of this._tasks.values()) {
      if (task.status !== 'complete' && task.status !== 'failed') return false;
    }
    return this._tasks.size > 0;
  }

  /** Clear all tasks */
  clear() {
    this._tasks.clear();
  }

  /** Subscribe to task events */
  on(callback) {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  // ---- Internal ----

  _depsResolved(task) {
    return task.dependencies.every(depId => {
      const dep = this._tasks.get(depId);
      return dep && dep.status === 'complete';
    });
  }

  _emit(event, task) {
    for (const cb of this._listeners) {
      try { cb(event, task); } catch (e) { console.error('[TaskQueue]', e); }
    }
  }
}
