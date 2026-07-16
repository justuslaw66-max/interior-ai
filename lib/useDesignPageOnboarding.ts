"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getAnonId } from "@/lib/anon";
import { track } from "@/lib/analytics";
import { CATALOG_ITEMS } from "@/lib/catalog";
import { mapToTopCategory } from "@/lib/catalog/view-builders";
import { evaluateConstraints, type ConstraintResult } from "@/lib/constraints/evaluate";
import type { EditorViewMode } from "@/lib/editorScene";
import {
  buildFirstRunActivationState,
  type FirstRunActivationStepId,
} from "@/lib/first-run-activation";
import {
  checkActivation,
  EventDedup,
  getNextBestActionNudge,
  isOnboardingEligible,
  type OnboardingState,
} from "@/lib/onboarding";
import type { Plan } from "@/lib/plan";
import type { DesignItem, ZoneMin } from "@/lib/room-types";
import type { FunnelEventName } from "@/lib/design-page-paywall";
import type { DesignPageEditorMode } from "@/lib/useDesignPagePanelMode";

type DesignMode = "homeowner" | "designer";

type ClampToRoom = (
  x: number,
  z: number,
  itemWidth: number,
  itemDepth: number,
  roomWidth: number,
  roomDepth: number,
  wallThickness: number,
  rotationY?: number
) => [number, number];

export type DesignPageOnboardingState = {
  designId: string | null;
  shareToken: string | null;
  plan: Plan;
  editorMode: DesignPageEditorMode;
  viewMode: EditorViewMode;
  mode: DesignMode;
  isClientPreview: boolean;
  isGuest: boolean;
  items: DesignItem[];
  zones: ZoneMin[];
  constraintResults: ConstraintResult[];
  showBetaStart: boolean;
  designRoomCount: number;
  planRoomCount: number;
  saveStatusKind: string;
  planGuidedActionsEnabled: boolean;
  viewportSize: {
    width: number;
    height: number;
  };
};

export type DesignPageOnboardingActions = {
  autoCreateSeatingZone: (sofaItem: DesignItem) => void;
  clampToRoom: ClampToRoom;
  showConstraintsForMoment: (results: ConstraintResult[]) => void;
  showConfidenceSummary: (results: ConstraintResult[]) => void;
  logFunnelEvent: (
    eventType: FunnelEventName,
    meta?: Record<string, unknown>
  ) => void;
};

export type DesignPageOnboardingConfiguration = {
  roomWidth: number;
  roomDepth: number;
  wallThickness: number;
};

export type UseDesignPageOnboardingOptions = {
  state: DesignPageOnboardingState;
  actions: DesignPageOnboardingActions;
  configuration: DesignPageOnboardingConfiguration;
};

function findCatalogItemByCategory(category: string, targetWidth?: number) {
  const candidates = Object.values(CATALOG_ITEMS).filter(
    (product) => product.category === category
  );
  if (!candidates.length) return null;
  if (!targetWidth) return candidates[0];

  let best = candidates[0];
  let bestDelta = Math.abs(candidates[0].dimsMm.w / 1000 - targetWidth);
  for (const candidate of candidates) {
    const delta = Math.abs(candidate.dimsMm.w / 1000 - targetWidth);
    if (delta < bestDelta) {
      best = candidate;
      bestDelta = delta;
    }
  }
  return best;
}

function buildGhostSuggestions({
  sofaItem,
  roomWidth,
  roomDepth,
  wallThickness,
  clampToRoom,
}: {
  sofaItem: DesignItem;
  roomWidth: number;
  roomDepth: number;
  wallThickness: number;
  clampToRoom: ClampToRoom;
}) {
  const sofaProduct = CATALOG_ITEMS[sofaItem.productId];
  if (!sofaProduct) return [];

  const suggestions: Array<{
    id: string;
    productId: string;
    position: [number, number, number];
    rotationY?: number;
  }> = [];

  const targetRugWidth = (sofaProduct.dimsMm.w / 1000) * 0.72;
  const rugProduct = findCatalogItemByCategory("rug", targetRugWidth);
  if (rugProduct) {
    const rugZ = sofaItem.position[2] + (sofaProduct.dimsMm.d / 1000) * 0.35;
    const [safeX, safeZ] = clampToRoom(
      sofaItem.position[0],
      rugZ,
      rugProduct.dimsMm.w / 1000,
      rugProduct.dimsMm.d / 1000,
      roomWidth,
      roomDepth,
      wallThickness
    );
    suggestions.push({
      id: "ghost-rug",
      productId: rugProduct.id,
      position: [safeX, 0, safeZ],
    });
  }

  const coffeeProduct = findCatalogItemByCategory("coffee_table");
  if (coffeeProduct) {
    const sofaFrontZ = sofaItem.position[2] + sofaProduct.dimsMm.d / 1000 / 2;
    const coffeeZ = sofaFrontZ + 0.45 + coffeeProduct.dimsMm.d / 1000 / 2;
    const [safeX, safeZ] = clampToRoom(
      sofaItem.position[0],
      coffeeZ,
      coffeeProduct.dimsMm.w / 1000,
      coffeeProduct.dimsMm.d / 1000,
      roomWidth,
      roomDepth,
      wallThickness
    );
    suggestions.push({
      id: "ghost-coffee",
      productId: coffeeProduct.id,
      position: [safeX, 0, safeZ],
    });
  }

  const nearLeft = sofaItem.position[0] < -roomWidth * 0.25;
  const nearRight = sofaItem.position[0] > roomWidth * 0.25;
  const nearBack = sofaItem.position[2] < -roomDepth * 0.25;
  const nearFront = sofaItem.position[2] > roomDepth * 0.25;
  const isCorner = (nearLeft || nearRight) && (nearBack || nearFront);
  const lampProduct = findCatalogItemByCategory("floor_lamp");

  if (isCorner && lampProduct) {
    const side = nearLeft ? -1 : 1;
    const depth = nearBack ? -1 : 1;
    const lampX =
      sofaItem.position[0] +
      side *
        (sofaProduct.dimsMm.w / 1000 / 2 +
          lampProduct.dimsMm.w / 1000 / 2 +
          0.2);
    const lampZ =
      sofaItem.position[2] +
      depth *
        (sofaProduct.dimsMm.d / 1000 / 2 +
          lampProduct.dimsMm.d / 1000 / 2 +
          0.2);
    const [safeX, safeZ] = clampToRoom(
      lampX,
      lampZ,
      lampProduct.dimsMm.w / 1000,
      lampProduct.dimsMm.d / 1000,
      roomWidth,
      roomDepth,
      wallThickness
    );
    suggestions.push({
      id: "ghost-lamp",
      productId: lampProduct.id,
      position: [safeX, 0, safeZ],
    });
  }

  return suggestions;
}

export function useDesignPageOnboarding({
  state,
  actions,
  configuration,
}: UseDesignPageOnboardingOptions) {
  const {
    autoCreateSeatingZone,
    clampToRoom,
    showConstraintsForMoment,
    showConfidenceSummary,
    logFunnelEvent,
  } = actions;
  const { roomWidth, roomDepth, wallThickness } = configuration;
  const [onboardingState, setOnboardingState] = useState<OnboardingState>(() => ({
    enabled: false,
    step: "idle",
    startedAtMs: Date.now(),
    lastInteractionAtMs: Date.now(),
    dismissedHints: {},
  }));
  const [nextBestActionNudge, setNextBestActionNudge] = useState<string | null>(
    null
  );

  const onboardingStartedAtRef = useRef<number | null>(null);
  const firstItemTrackedRef = useRef(false);
  const firstItemFunnelTrackedRef = useRef(false);
  const thirdItemTrackedRef = useRef(false);
  const firstSofaHandledRef = useRef(false);
  const ghostTimerRef = useRef<number | null>(null);
  const nudgeShownCountRef = useRef(0);
  const [initialActionTime] = useState(() => Date.now());
  const lastActionTimeRef = useRef<number>(initialActionTime);
  const stallDetectionTimerRef = useRef<number | null>(null);
  const eventDedupRef = useRef(EventDedup.createSession());
  const firstRunActivationTrackedStepsRef = useRef<
    Map<string, Set<FirstRunActivationStepId>>
  >(new Map());

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (window.localStorage.getItem("onboarded") === "1") {
        // This one-time hydration intentionally mirrors the persisted onboarding state.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setOnboardingState((current) => ({
          ...current,
          enabled: false,
          step: "completed",
        }));
      }
    } catch {
      // Ignore storage errors; eligibility will use the in-memory state.
    }
  }, []);

  useEffect(() => {
    const eligible = isOnboardingEligible({
      isNewUser: !onboardingState.enabled && onboardingState.step === "idle",
      isPro: state.plan === "pro",
      isShared: Boolean(state.shareToken),
      isClientPreview: state.isClientPreview,
      mode: state.editorMode === "ai" ? "design" : state.editorMode,
    });

    if (eligible && !onboardingState.enabled) {
      const now = Date.now();
      // Eligibility is external session state and starts onboarding exactly once.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOnboardingState({
        enabled: true,
        step: "prompt_add_sofa",
        startedAtMs: now,
        lastInteractionAtMs: now,
        dismissedHints: {},
      });
      onboardingStartedAtRef.current = now;
      track("onboarding_started", {
        design_id: state.designId,
        plan: state.plan,
        isGuest: state.isGuest,
      });
    }
  }, [
    onboardingState.enabled,
    onboardingState.step,
    state.designId,
    state.editorMode,
    state.isClientPreview,
    state.isGuest,
    state.plan,
    state.shareToken,
  ]);

  useEffect(() => {
    if (!onboardingState.enabled || onboardingState.step === "completed") return;
    if (!state.items.length || firstItemTrackedRef.current) return;

    const firstItem = state.items[state.items.length - 1];
    const firstProduct = CATALOG_ITEMS[firstItem.productId];
    const eventKey = EventDedup.makeKey("first_item_added", state.designId);

    if (!eventDedupRef.current.has(eventKey)) {
      eventDedupRef.current.mark(eventKey);
      const startedAt = onboardingStartedAtRef.current ?? Date.now();
      track("first_item_added", {
        design_id: state.designId,
        isGuest: state.isGuest,
        itemType: firstProduct?.category ?? "unknown",
        timeSinceStartMs: Date.now() - startedAt,
      });
    }
    firstItemTrackedRef.current = true;
  }, [
    onboardingState.enabled,
    onboardingState.step,
    state.designId,
    state.isGuest,
    state.items,
  ]);

  useEffect(() => {
    if (state.items.length < 1 || firstItemFunnelTrackedRef.current) return;

    const firstItem = state.items[state.items.length - 1];
    const firstProduct = CATALOG_ITEMS[firstItem.productId];
    const meta = {
      itemType: firstProduct?.category ?? "unknown",
      isGuest: state.isGuest,
      mode: state.mode,
    };

    if (!onboardingState.enabled) {
      track("first_item_added", {
        design_id: state.designId,
        ...meta,
      });
    }

    logFunnelEvent("first_item_added", meta);
    firstItemFunnelTrackedRef.current = true;
  }, [
    logFunnelEvent,
    onboardingState.enabled,
    state.designId,
    state.isGuest,
    state.items,
    state.mode,
  ]);

  useEffect(() => {
    if (state.items.length < 3 || thirdItemTrackedRef.current) return;

    track("third_item_added", {
      design_id: state.designId,
      isGuest: state.isGuest,
      mode: state.mode,
      items_count: state.items.length,
    });
    logFunnelEvent("third_item_added", {
      isGuest: state.isGuest,
      mode: state.mode,
      items_count: state.items.length,
    });
    thirdItemTrackedRef.current = true;
  }, [
    logFunnelEvent,
    state.designId,
    state.isGuest,
    state.items.length,
    state.mode,
  ]);

  useEffect(() => {
    if (!onboardingState.enabled || onboardingState.step !== "prompt_add_sofa") {
      return;
    }

    const sofaItem = state.items.find((item) => {
      const catalogItem = CATALOG_ITEMS[item.productId];
      return catalogItem
        ? mapToTopCategory(catalogItem.category, catalogItem) === "sofa"
        : false;
    });
    if (!sofaItem || firstSofaHandledRef.current) return;

    firstSofaHandledRef.current = true;
    autoCreateSeatingZone(sofaItem);

    const results = evaluateConstraints({
      design: { items: state.items },
      movedItemId: sofaItem.instanceId,
      room: { width: roomWidth, depth: roomDepth, wallThickness },
    });
    showConstraintsForMoment(results);
    showConfidenceSummary(results);

    track("seating_zone_auto_created", {
      design_id: state.designId,
      isGuest: state.isGuest,
      timeSinceStartMs:
        Date.now() - (onboardingStartedAtRef.current ?? Date.now()),
    });

    // The first sofa milestone advances the onboarding state synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOnboardingState((current) => ({
      ...current,
      step: "sofa_placed",
      lastInteractionAtMs: Date.now(),
    }));

    if (ghostTimerRef.current) {
      window.clearTimeout(ghostTimerRef.current);
    }
    ghostTimerRef.current = window.setTimeout(() => {
      const suggestions = buildGhostSuggestions({
        sofaItem,
        roomWidth,
        roomDepth,
        wallThickness,
        clampToRoom,
      });
      if (suggestions.length > 0) {
        track("ghost_suggestion_shown", {
          design_id: state.designId,
          isGuest: state.isGuest,
          suggestionCount: suggestions.length,
        });

        if (ghostTimerRef.current) {
          window.clearTimeout(ghostTimerRef.current);
        }
        ghostTimerRef.current = window.setTimeout(() => {
          setOnboardingState((current) => ({
            ...current,
            step: "ghosts_shown",
            lastInteractionAtMs: Date.now(),
          }));
        }, 8000);
      } else {
        setOnboardingState((current) => ({
          ...current,
          step: "ghosts_shown",
          lastInteractionAtMs: Date.now(),
        }));
      }
    }, 600);
  }, [
    autoCreateSeatingZone,
    clampToRoom,
    roomDepth,
    roomWidth,
    showConfidenceSummary,
    showConstraintsForMoment,
    wallThickness,
    onboardingState.enabled,
    onboardingState.step,
    state.designId,
    state.isGuest,
    state.items,
  ]);

  useEffect(() => {
    if (!onboardingState.enabled || onboardingState.step === "completed") return;

    const sofaItem = state.items.find((item) => {
      const catalogItem = CATALOG_ITEMS[item.productId];
      return catalogItem
        ? mapToTopCategory(catalogItem.category, catalogItem) === "sofa"
        : false;
    });
    const rugItem = state.items.find(
      (item) => CATALOG_ITEMS[item.productId]?.category === "rug"
    );
    const coffeeItem = state.items.find(
      (item) => CATALOG_ITEMS[item.productId]?.category === "coffee_table"
    );
    const hasSeatingZone = state.zones.some((zone) => zone.type === "seating");
    const isActivated = checkActivation({
      constraintResults: state.constraintResults,
      hasSofa: Boolean(sofaItem),
      hasRug: Boolean(rugItem),
      hasCoffeeTable: Boolean(coffeeItem),
      hasSeatingZone,
    });

    if (isActivated && onboardingState.step !== "activated") {
      // Activation is a derived milestone and must advance before its completion timer.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOnboardingState((current) => ({
        ...current,
        step: "activated",
        lastInteractionAtMs: Date.now(),
      }));

      const eventKey = EventDedup.makeKey("first_valid_layout", state.designId);
      if (!eventDedupRef.current.has(eventKey)) {
        eventDedupRef.current.mark(eventKey);
        track("first_valid_layout", {
          design_id: state.designId,
          isGuest: state.isGuest,
          has: {
            sofa: Boolean(sofaItem),
            rug: Boolean(rugItem),
            coffee_table: Boolean(coffeeItem),
            seating_zone: hasSeatingZone,
          },
          timeSinceStartMs:
            Date.now() - (onboardingStartedAtRef.current ?? Date.now()),
        });
      }

      window.setTimeout(() => {
        setOnboardingState((current) => ({
          ...current,
          step: "completed",
        }));
        try {
          window.localStorage.setItem("onboarded", "1");
        } catch {
          // Ignore storage errors.
        }
        track("onboarding_completed", {
          design_id: state.designId,
          isGuest: state.isGuest,
          completionReason: "valid_layout",
          timeSinceStartMs:
            Date.now() - (onboardingStartedAtRef.current ?? Date.now()),
        });
      }, 2500);
    }
  }, [
    onboardingState.enabled,
    onboardingState.step,
    state.constraintResults,
    state.designId,
    state.isGuest,
    state.items,
    state.zones,
  ]);

  useEffect(() => {
    if (
      !onboardingState.enabled ||
      state.editorMode === "present" ||
      state.isClientPreview
    ) {
      return;
    }

    if (stallDetectionTimerRef.current) {
      window.clearTimeout(stallDetectionTimerRef.current);
    }

    const stallThresholdMs = 13000;
    stallDetectionTimerRef.current = window.setTimeout(() => {
      const timeSinceLastAction = Date.now() - lastActionTimeRef.current;

      if (timeSinceLastAction >= stallThresholdMs && nudgeShownCountRef.current < 2) {
        const sofaItem = state.items.find((item) => {
          const catalogItem = CATALOG_ITEMS[item.productId];
          return catalogItem
            ? mapToTopCategory(catalogItem.category, catalogItem) === "sofa"
            : false;
        });
        const rugItem = state.items.find(
          (item) => CATALOG_ITEMS[item.productId]?.category === "rug"
        );
        const coffeeItem = state.items.find(
          (item) => CATALOG_ITEMS[item.productId]?.category === "coffee_table"
        );
        const nudgeText = getNextBestActionNudge({
          hasItems: state.items.length > 0,
          hasSofa: Boolean(sofaItem),
          hasRug: Boolean(rugItem),
          hasCoffeeTable: Boolean(coffeeItem),
          contentWarningCount: state.constraintResults.filter(
            (result) => result.level === "warn" || result.level === "error"
          ).length,
          cartCount: state.items.filter((item) => item.includeInCheckout).length,
          mode: state.editorMode === "ai" ? "design" : state.editorMode,
        });

        if (nudgeText) {
          setNextBestActionNudge(nudgeText);
          nudgeShownCountRef.current += 1;

          window.setTimeout(() => {
            setNextBestActionNudge(null);
          }, 5000);

          track("stall_nudge_shown", {
            design_id: state.designId,
            nudge_text: nudgeText,
            nudge_count: nudgeShownCountRef.current,
          });
        }
      }
    }, stallThresholdMs);

    return () => {
      if (stallDetectionTimerRef.current) {
        window.clearTimeout(stallDetectionTimerRef.current);
      }
    };
  }, [
    onboardingState.enabled,
    state.constraintResults,
    state.designId,
    state.editorMode,
    state.isClientPreview,
    state.items,
  ]);

  const firstRunActivationState = useMemo(
    () =>
      buildFirstRunActivationState({
        templateChosen:
          !state.showBetaStart ||
          state.designRoomCount > 1 ||
          state.items.length > 0,
        itemCount: state.items.length,
        saveState:
          state.saveStatusKind === "saved"
            ? "saved"
            : state.saveStatusKind === "saving"
              ? "saving"
              : state.saveStatusKind === "failed"
                ? "failed"
                : "idle",
        shareToken: state.shareToken,
        exportOpened: state.editorMode === "present",
      }),
    [
      state.designRoomCount,
      state.editorMode,
      state.items.length,
      state.saveStatusKind,
      state.shareToken,
      state.showBetaStart,
    ]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const storageKey = `first_run_activation_steps:${
      state.designId ?? getAnonId()
    }`;
    const storedSteps = new Set<FirstRunActivationStepId>();

    try {
      const rawStoredSteps = window.localStorage.getItem(storageKey);
      const parsedStoredSteps = rawStoredSteps ? JSON.parse(rawStoredSteps) : [];
      if (Array.isArray(parsedStoredSteps)) {
        parsedStoredSteps.forEach((step) => {
          if (
            step === "choose_template" ||
            step === "add_or_adjust_item" ||
            step === "save_design" ||
            step === "share_or_export"
          ) {
            storedSteps.add(step);
          }
        });
      }
    } catch {
      // Ignore malformed local tracking state; analytics should never block editing.
    }

    const sessionTrackedSteps =
      firstRunActivationTrackedStepsRef.current.get(storageKey) ??
      new Set<FirstRunActivationStepId>();
    sessionTrackedSteps.forEach((step) => storedSteps.add(step));

    let changed = false;
    firstRunActivationState.steps.forEach((step) => {
      if (!step.complete || storedSteps.has(step.id)) return;

      const meta = {
        step_id: step.id,
        step_label: step.label,
        progress_percent: firstRunActivationState.progressPercent,
        activation_complete: firstRunActivationState.complete,
        mode: state.mode,
        view_mode: state.viewMode,
        guided_plan_actions: state.planGuidedActionsEnabled,
        room_count: state.planRoomCount,
        item_count: state.items.length,
        save_status: state.saveStatusKind,
        share_enabled: Boolean(state.shareToken),
        viewport_width: state.viewportSize.width,
        viewport_height: state.viewportSize.height,
      };

      track("first_run_activation_step_completed", {
        design_id: state.designId ?? null,
        ...meta,
      });
      logFunnelEvent("first_run_activation_step_completed", meta);
      storedSteps.add(step.id);
      sessionTrackedSteps.add(step.id);
      changed = true;
    });

    if (changed) {
      firstRunActivationTrackedStepsRef.current.set(
        storageKey,
        sessionTrackedSteps
      );
      try {
        window.localStorage.setItem(
          storageKey,
          JSON.stringify(Array.from(storedSteps))
        );
      } catch {
        // Ignore storage failures; the in-memory guard still prevents duplicates.
      }
    }
  }, [
    logFunnelEvent,
    firstRunActivationState.complete,
    firstRunActivationState.progressPercent,
    firstRunActivationState.steps,
    state.designId,
    state.items.length,
    state.mode,
    state.planGuidedActionsEnabled,
    state.planRoomCount,
    state.saveStatusKind,
    state.shareToken,
    state.viewMode,
    state.viewportSize.height,
    state.viewportSize.width,
  ]);

  return {
    state: {
      firstRunActivationState,
      nextBestActionNudge,
    },
  };
}
