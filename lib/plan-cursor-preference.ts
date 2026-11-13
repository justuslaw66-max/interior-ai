"use client";

import { useSyncExternalStore } from "react";

/**
 * The customer's cursor style for the plan, chosen in Preferences (J, 13 Nov 2026). It belongs to
 * this device, like a browser setting: kept in localStorage, read when a cursor is drawn, and
 * shared by every open editor tab through the storage event.
 */
export const PLAN_CURSOR_THEMES = ["gummy", "marshmallow", "sprinkles", "standard"] as const;
export type PlanCursorTheme = (typeof PLAN_CURSOR_THEMES)[number];
export const DEFAULT_PLAN_CURSOR_THEME: PlanCursorTheme = "gummy";
export const PLAN_CURSOR_THEME_STORAGE_KEY = "interior-ai:preferences:plan-cursor-theme";

export const PLAN_CURSOR_THEME_LABELS: Record<PlanCursorTheme, { label: string; detail: string }> = {
  gummy: { label: "Gummy", detail: "Soft peach arrows with a little shine." },
  marshmallow: { label: "Marshmallow", detail: "Puffy cream arrows with a pink edge." },
  sprinkles: { label: "Jelly with sprinkles", detail: "Mint jelly arrows; the turn ring has sprinkles." },
  standard: { label: "Standard", detail: "Your browser's own cursors." },
};

export function isPlanCursorTheme(value: unknown): value is PlanCursorTheme {
  return typeof value === "string" && (PLAN_CURSOR_THEMES as readonly string[]).includes(value);
}

const listeners = new Set<() => void>();
let current: PlanCursorTheme | null = null;

function readStored(): PlanCursorTheme {
  try {
    const stored = globalThis.localStorage?.getItem(PLAN_CURSOR_THEME_STORAGE_KEY);
    return isPlanCursorTheme(stored) ? stored : DEFAULT_PLAN_CURSOR_THEME;
  } catch {
    return DEFAULT_PLAN_CURSOR_THEME; // storage blocked (private mode, sandboxed frame)
  }
}

/** The chosen style; Gummy until the customer picks another. */
export function getPlanCursorTheme(): PlanCursorTheme {
  current ??= readStored();
  return current;
}

export function setPlanCursorTheme(theme: PlanCursorTheme): void {
  current = theme;
  try {
    globalThis.localStorage?.setItem(PLAN_CURSOR_THEME_STORAGE_KEY, theme);
  } catch {
    // Not kept past this visit when storage is blocked; the choice still applies now.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== PLAN_CURSOR_THEME_STORAGE_KEY) return;
    current = readStored();
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** The chosen style for React, updating when it changes here or in another tab. */
export function usePlanCursorTheme(): PlanCursorTheme {
  return useSyncExternalStore(subscribe, getPlanCursorTheme, () => DEFAULT_PLAN_CURSOR_THEME);
}
