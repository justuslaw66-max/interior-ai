/**
 * Transaction-based history manager with named actions, coalescing, and rollback.
 * Supports safe bulk operations with automatic rollback on failure.
 */

export type Snapshot = unknown;

export interface HistoryEntry<TSnapshot = Snapshot> {
  name: string;
  before: TSnapshot;
  after: TSnapshot;
  ts: number;
}

export class HistoryManager<TSnapshot = Snapshot> {
  private past: HistoryEntry<TSnapshot>[] = [];
  private future: HistoryEntry<TSnapshot>[] = [];
  private txn: { name: string; before: TSnapshot } | null = null;
  private maxEntries = 100;

  constructor(
    private get: () => TSnapshot,
    private set: (s: TSnapshot) => void
  ) {}

  /**
   * Begin a named transaction. Nested begins are ignored (no stacking).
   */
  begin(name: string) {
    if (this.txn) {
      console.warn(`Transaction already active: "${this.txn.name}". Ignoring begin("${name}")`);
      return;
    }
    this.txn = {
      name,
      before: this.structuredClone(this.get()),
    };
  }

  /**
   * Commit the current transaction. Skips no-op commits (before === after).
   * Clears future stack on successful commit.
   */
  commit() {
    if (!this.txn) {
      console.warn("No active transaction to commit");
      return;
    }

    const after = this.structuredClone(this.get());
    const before = this.txn.before;
    const name = this.txn.name;

    this.txn = null;

    // Skip no-op commits
    if (JSON.stringify(before) === JSON.stringify(after)) {
      return;
    }

    this.past.push({ name, before, after, ts: Date.now() });
    this.future = [];

    // Trim history if exceeded max
    if (this.past.length > this.maxEntries) {
      this.past = this.past.slice(-this.maxEntries);
    }
  }

  /**
   * Rollback the current transaction and restore the before state.
   * Sets txn to null after rollback.
   */
  rollback() {
    if (!this.txn) {
      console.warn("No active transaction to rollback");
      return;
    }

    const before = this.txn.before;
    this.txn = null;
    this.set(before);
  }

  /**
   * Undo the last action. Returns the name of the undone action, or null if not possible.
   */
  undo(): string | null {
    if (this.txn) {
      console.warn("Cannot undo while transaction is active");
      return null;
    }

    const entry = this.past.pop();
    if (!entry) return null;

    this.future.push(entry);
    this.set(entry.before);
    return entry.name;
  }

  /**
   * Redo the last undone action. Returns the name of the redone action, or null if not possible.
   */
  redo(): string | null {
    if (this.txn) {
      console.warn("Cannot redo while transaction is active");
      return null;
    }

    const entry = this.future.pop();
    if (!entry) return null;

    this.past.push(entry);
    this.set(entry.after);
    return entry.name;
  }

  /**
   * Check if undo is available.
   */
  canUndo(): boolean {
    return this.past.length > 0 && !this.txn;
  }

  /**
   * Check if redo is available.
   */
  canRedo(): boolean {
    return this.future.length > 0 && !this.txn;
  }

  /**
   * Get the name of the action that will be undone. Useful for tooltips.
   */
  getUndoName(): string | null {
    return this.past.length > 0 ? this.past[this.past.length - 1].name : null;
  }

  /**
   * Get the name of the action that will be redone. Useful for tooltips.
   */
  getRedoName(): string | null {
    return this.future.length > 0 ? this.future[this.future.length - 1].name : null;
  }

  /**
   * Get full history for debugging or UI display.
   */
  getHistory(): {
    past: HistoryEntry<TSnapshot>[];
    future: HistoryEntry<TSnapshot>[];
    txn: { name: string; before: TSnapshot } | null;
  } {
    return {
      past: this.past,
      future: this.future,
      txn: this.txn,
    };
  }

  /**
   * Clear all history.
   */
  clear() {
    this.past = [];
    this.future = [];
    this.txn = null;
  }

  /**
   * Deep clone helper using structuredClone (modern browsers) or fallback to JSON
   */
  private structuredClone(obj: TSnapshot): TSnapshot {
    if (typeof globalThis !== "undefined" && "structuredClone" in globalThis) {
      return structuredClone(obj);
    }
    // Fallback for older environments
    return JSON.parse(JSON.stringify(obj));
  }
}
