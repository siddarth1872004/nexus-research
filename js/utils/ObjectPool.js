// ============================================================
// NexusResearch -- Object Pool
// Generic reusable object pool to reduce GC pressure
// ============================================================

export class ObjectPool {
  /**
   * @param {Function} factory  - Creates a new object when pool is empty
   * @param {Function} reset    - Resets an object before returning to pool
   * @param {number}   maxSize  - Maximum number of objects to keep in pool
   */
  constructor(factory, reset = () => {}, maxSize = 64) {
    this._factory = factory;
    this._reset = reset;
    this._maxSize = maxSize;
    this._pool = [];
    this._activeCount = 0;
  }

  /** Acquire an object from the pool or create a new one */
  acquire() {
    this._activeCount++;
    if (this._pool.length > 0) {
      return this._pool.pop();
    }
    return this._factory();
  }

  /** Return an object to the pool */
  release(obj) {
    this._activeCount = Math.max(0, this._activeCount - 1);
    if (this._pool.length < this._maxSize) {
      this._reset(obj);
      this._pool.push(obj);
    }
    // else discard -- pool is full
  }

  /** Number of objects currently in use */
  get activeCount() {
    return this._activeCount;
  }

  /** Number of objects available in pool */
  get availableCount() {
    return this._pool.length;
  }

  /** Clear the pool */
  drain() {
    this._pool.length = 0;
    this._activeCount = 0;
  }
}
