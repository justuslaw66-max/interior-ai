import type { CabinetPresetId } from "../presets";
import type { CabinetDefinition } from "../types";

export const CABINET_STUDIO_HISTORY_LIMIT = 60;

export interface CabinetTemplateSourceIdentity {
  presetId: CabinetPresetId | null;
  savedTemplateId: string | null;
}

export interface CabinetHistoryEntry extends CabinetTemplateSourceIdentity {
  definition: CabinetDefinition;
}

export interface CabinetStudioHistoryState {
  past: CabinetHistoryEntry[];
  future: CabinetHistoryEntry[];
}

export interface CabinetStudioHistoryTransition {
  history: CabinetStudioHistoryState;
  entry: CabinetHistoryEntry;
}

export function createCabinetStudioHistory(): CabinetStudioHistoryState {
  return { past: [], future: [] };
}

export function createCabinetHistoryEntry(
  definition: CabinetDefinition,
  source: CabinetTemplateSourceIdentity
): CabinetHistoryEntry {
  return { definition, ...source };
}

export function recordCabinetStudioHistory(
  history: CabinetStudioHistoryState,
  entry: CabinetHistoryEntry
): CabinetStudioHistoryState {
  return {
    past: [...history.past, entry].slice(-CABINET_STUDIO_HISTORY_LIMIT),
    future: [],
  };
}

export function undoCabinetStudioHistory(
  history: CabinetStudioHistoryState,
  current: CabinetHistoryEntry
): CabinetStudioHistoryTransition | null {
  const entry = history.past[history.past.length - 1];
  if (!entry) return null;
  return {
    entry,
    history: {
      past: history.past.slice(0, -1),
      future: [current, ...history.future].slice(0, CABINET_STUDIO_HISTORY_LIMIT),
    },
  };
}

export function redoCabinetStudioHistory(
  history: CabinetStudioHistoryState,
  current: CabinetHistoryEntry
): CabinetStudioHistoryTransition | null {
  const entry = history.future[0];
  if (!entry) return null;
  return {
    entry,
    history: {
      past: [...history.past, current].slice(-CABINET_STUDIO_HISTORY_LIMIT),
      future: history.future.slice(1),
    },
  };
}

export function clearSavedTemplateFromCabinetStudioHistory(
  history: CabinetStudioHistoryState,
  savedTemplateId: string
): CabinetStudioHistoryState {
  const clearSource = (entry: CabinetHistoryEntry): CabinetHistoryEntry =>
    entry.savedTemplateId === savedTemplateId
      ? { ...entry, savedTemplateId: null }
      : entry;
  return {
    past: history.past.map(clearSource),
    future: history.future.map(clearSource),
  };
}

export function canUndoCabinetStudioHistory(
  history: CabinetStudioHistoryState
): boolean {
  return history.past.length > 0;
}

export function canRedoCabinetStudioHistory(
  history: CabinetStudioHistoryState
): boolean {
  return history.future.length > 0;
}
