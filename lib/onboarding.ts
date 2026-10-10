/**
 * Onboarding System - State Model & Logic
 * 
 * Responsible for:
 * - OnboardingState type definition
 * - Step progression logic
 * - Enable rules (eligibility checks)
 * - Session-scoped event deduplication
 */

import { CATALOG_ITEMS } from "@/lib/catalog";

export type OnboardingLifecycleStep =
  | "idle"
  | "prompt_add_sofa"
  | "sofa_placed"
  | "ghosts_shown"
  | "activated"
  | "completed";

export type OnboardingStep =
  | "sofa"
  | "rug"
  | "coffee_table"
  | "reading_corner";

export type OnboardingState = {
  enabled: boolean;
  step: OnboardingLifecycleStep;
  startedAtMs: number;
  lastInteractionAtMs: number;
  dismissedHints: Record<string, boolean>;
};

export function getOnboardingProgress(
  items: Array<{ productId: string }>
): {
  has: Record<OnboardingStep, boolean>;
  next: OnboardingStep | null;
  done: boolean;
} {
  const categories = new Set(
    items
      .map((item) => CATALOG_ITEMS[item.productId]?.category)
      .filter(Boolean)
  );

  const has: Record<OnboardingStep, boolean> = {
    sofa: categories.has("sofa"),
    rug: categories.has("rug"),
    coffee_table: categories.has("coffee_table"),
    reading_corner:
      categories.has("accent_chair") && categories.has("floor_lamp"),
  };

  const ordered: OnboardingStep[] = [
    "sofa",
    "rug",
    "coffee_table",
    "reading_corner",
  ];
  const next = ordered.find((step) => !has[step]) ?? null;

  return {
    has,
    next,
    done: next === null,
  };
}

/**
 * Eligibility rules for onboarding
 * Only show for a new user when the active experience does not skip guided
 * onboarding, and the design is not shared or read-only.
 */
export function isOnboardingEligible(opts: {
  isNewUser?: boolean;
  skipGuidedOnboarding?: boolean;
  isShared?: boolean;
  isClientPreview?: boolean;
}): boolean {
  const {
    isNewUser = true,
    skipGuidedOnboarding = false,
    isShared = false,
    isClientPreview = false,
  } = opts;

  // Not eligible if:
  // - The active experience intentionally skips guided onboarding
  // - Shared or client preview
  // - Not a new user
  if (skipGuidedOnboarding || isShared || isClientPreview) {
    return false;
  }

  return isNewUser;
}

/**
 * The first valid layout: a sofa (or a seating zone) with no constraint errors. The rug and coffee
 * table flags stay in the call for its analytics.
 */
export function checkActivation(opts: {
  constraintResults?: Array<{
    id: string;
    level: "ok" | "warn" | "error";
  }>;
  hasSofa: boolean;
  hasRug: boolean;
  hasCoffeeTable: boolean;
  hasSeatingZone: boolean;
}): boolean {
  const { constraintResults = [], hasSofa = false, hasSeatingZone = false } = opts;

  // The first sofa with no constraint errors is the first valid layout. The first sofa used to make
  // a seating zone and the zone was the milestone; zones are Pro's now (UX 4g, FU6), so the sofa
  // itself counts. A rug or a coffee table no longer matters: a sofa already passes. A seating zone
  // (Pro's) still counts too.
  if (!hasSofa && !hasSeatingZone) return false;
  return !constraintResults.some((r) => r.level === "error");
}

/**
 * Deduping helpers for event firing
 */
export const EventDedup = {
  /**
   * Track which events have fired this session to avoid duplicates
   * Store in refs / sessionStorage for page reloads
   */
  createSession: () => {
    const fired = new Set<string>();
    return {
      has: (eventKey: string) => fired.has(eventKey),
      mark: (eventKey: string) => fired.add(eventKey),
    };
  },

  /**
   * Generate unique key for first_* events
   * Examples: "first_item_added:design-123", "first_valid_layout:design-123"
   */
  makeKey: (eventName: string, designId: string | null) =>
    `${eventName}:${designId ?? "guest"}`,
};
