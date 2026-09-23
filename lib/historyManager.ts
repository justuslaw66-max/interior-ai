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

export const DEFAULT_HISTORY_MAX_ENTRIES = 100;

export type HistoryCommand<TInput, TResult = void> = {
  /** Stable machine-readable identifier for diagnostics and future replay adapters. */
  id: string;
  /** Human-readable undo/redo label. */
  description: string;
  /** Serializable, deterministic input. The manager clones it before execution. */
  input: TInput;
  /** Apply the command through the document owner; throw to trigger rollback. */
  execute: (input: TInput) => TResult;
};

export type ContinuousHistoryCommandDescriptor = {
  id: string;
  description: string;
};

export type HistoryStatus = {
  pastCount: number;
  futureCount: number;
  activeCommand: { id: string | null; description: string; continuous: boolean } | null;
  maxEntries: number;
};

type ActiveTransaction<TSnapshot> = {
  id: string | null;
  name: string;
  before: TSnapshot;
  continuous: boolean;
};

export class HistoryManager<TSnapshot = Snapshot> {
  private past: HistoryEntry<TSnapshot>[] = [];
  private future: HistoryEntry<TSnapshot>[] = [];
  private txn: ActiveTransaction<TSnapshot> | null = null;
  private readonly maxEntries: number;

  constructor(
    private get: () => TSnapshot,
    private set: (s: TSnapshot) => void,
    private onChange?: () => void,
    options: { maxEntries?: number } = {}
  ) {
    const requestedMax = options.maxEntries ?? DEFAULT_HISTORY_MAX_ENTRIES;
    if (!Number.isInteger(requestedMax) || requestedMax < 1) {
      throw new Error("History maxEntries must be a positive integer");
    }
    this.maxEntries = requestedMax;
  }

  /**
   * Begin a named transaction. Nested begins are ignored (no stacking).
   */
  begin(name: string): boolean {
    if (this.txn) {
      console.warn(`Transaction already active: "${this.txn.name}". Ignoring begin("${name}")`);
      return false;
    }
    this.txn = {
      id: null,
      name,
      before: this.structuredClone(this.get()),
      continuous: false,
    };
    return true;
  }

  /**
   * Execute one discrete command atomically. Commands receive a cloned input,
   * cannot nest inside another transaction, and restore the captured snapshot
   * if execution fails.
   */
  executeCommand<TInput, TResult>(
    command: HistoryCommand<TInput, TResult>
  ): TResult {
    this.assertCommandDescriptor(command);
    if (this.txn) {
      throw new Error(
        `Cannot execute command "${command.id}" while "${this.txn.name}" is active`
      );
    }

    const input = this.structuredCloneValue(command.input);
    this.txn = {
      id: command.id,
      name: command.description,
      before: this.structuredClone(this.get()),
      continuous: false,
    };

    try {
      const result = command.execute(input);
      this.commit();
      return result;
    } catch (error) {
      this.rollback();
      throw error;
    }
  }

  /** Start a gesture transaction. Repeated updates remain one history entry. */
  beginContinuousCommand(command: ContinuousHistoryCommandDescriptor): void {
    this.assertCommandDescriptor(command);
    if (this.txn) {
      throw new Error(
        `Cannot begin continuous command "${command.id}" while "${this.txn.name}" is active`
      );
    }
    this.txn = {
      id: command.id,
      name: command.description,
      before: this.structuredClone(this.get()),
      continuous: true,
    };
  }

  /**
   * Apply one deterministic gesture update. A failed update cancels the whole
   * gesture so partial drag/resize state cannot survive.
   */
  updateContinuousCommand<TInput, TResult>(
    command: HistoryCommand<TInput, TResult>
  ): TResult {
    this.assertCommandDescriptor(command);
    const active = this.txn;
    if (!active?.continuous || active.id !== command.id) {
      throw new Error(`Continuous command "${command.id}" is not active`);
    }

    try {
      const input = this.structuredCloneValue(command.input);
      return command.execute(input);
    } catch (error) {
      this.rollback();
      throw error;
    }
  }

  commitContinuousCommand(commandId: string): void {
    this.assertActiveContinuousCommand(commandId);
    this.commit();
  }

  rollbackContinuousCommand(commandId: string): void {
    this.assertActiveContinuousCommand(commandId);
    this.rollback();
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
    this.onChange?.();
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
    this.onChange?.();
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
    this.onChange?.();
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
    this.onChange?.();
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
    past: readonly HistoryEntry<TSnapshot>[];
    future: readonly HistoryEntry<TSnapshot>[];
    txn: Readonly<ActiveTransaction<TSnapshot>> | null;
  } {
    return {
      past: this.structuredCloneValue(this.past),
      future: this.structuredCloneValue(this.future),
      txn: this.txn ? this.structuredCloneValue(this.txn) : null,
    };
  }

  /** Lightweight diagnostics that never expose or clone document snapshots. */
  getStatus(): HistoryStatus {
    return {
      pastCount: this.past.length,
      futureCount: this.future.length,
      activeCommand: this.txn
        ? {
            id: this.txn.id,
            description: this.txn.name,
            continuous: this.txn.continuous,
          }
        : null,
      maxEntries: this.maxEntries,
    };
  }

  /**
   * Clear all history.
   */
  clear() {
    this.past = [];
    this.future = [];
    this.txn = null;
    this.onChange?.();
  }

  /**
   * Deep clone helper using structuredClone (modern browsers) or fallback to JSON
   */
  private structuredClone(obj: TSnapshot): TSnapshot {
    return this.structuredCloneValue(obj);
  }

  private structuredCloneValue<T>(obj: T): T {
    if (typeof globalThis !== "undefined" && "structuredClone" in globalThis) {
      return structuredClone(obj);
    }
    // Fallback for older environments
    return JSON.parse(JSON.stringify(obj));
  }

  private assertCommandDescriptor(command: {
    id: string;
    description: string;
  }): void {
    if (!command.id.trim()) throw new Error("History command id is required");
    if (!command.description.trim()) {
      throw new Error("History command description is required");
    }
  }

  private assertActiveContinuousCommand(commandId: string): void {
    if (!this.txn?.continuous || this.txn.id !== commandId) {
      throw new Error(`Continuous command "${commandId}" is not active`);
    }
  }
}
