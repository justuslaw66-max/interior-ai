"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";
import { track } from "@/lib/analytics";
import type { AiLayoutRole } from "@/lib/ai/layout-planner";
import { bulkSwapItems } from "@/lib/bulkSwap";
import { CATALOG_ITEMS } from "@/lib/catalog";
import { evaluateConstraints } from "@/lib/constraints/evaluate";
import {
  buildAiLayoutCatalogEntries,
  buildAiLayoutItemsFromPlan,
  buildLocalAiStarterPlan,
  describeAiStarterValidationIssues,
  getRandomAiLayoutSeed,
  getRequiredAiLayoutCatalogCounts,
  type AiLayoutBudget,
  type ClampAiLayoutItem,
} from "@/lib/design-page-ai-layout";
import {
  buildPendingAiLayoutProposal,
  collectAiLayoutValidationSummary,
  type PendingAiLayoutProposal,
} from "@/lib/design-page-ai-layout-proposal";
import { pickBestRugForSofa } from "@/lib/design-page-rug-sizing";
import type { LayoutPlan } from "@/lib/design-page-types";
import type { FloorPlanAiPlanningContext } from "@/lib/floor-plan-quality";
import type { DesignItem, RoomType } from "@/lib/room-types";

type AiLayoutItemsUpdater =
  | DesignItem[]
  | ((currentItems: DesignItem[]) => DesignItem[]);

export type UseDesignPageAiLayoutParams = {
  state: {
    seed: number;
    pendingProposal: PendingAiLayoutProposal | null;
  };
  actions: {
    setSeed: Dispatch<SetStateAction<number>>;
    setPendingProposal: Dispatch<SetStateAction<PendingAiLayoutProposal | null>>;
    commitItems: (updater: AiLayoutItemsUpdater, historyLabel?: string) => void;
    clearAllSelection: () => void;
    setEditorMode: (mode: "ai") => void;
    setDesignPanelOpen: (open: boolean) => void;
    openGuestPrompt: (reason: string, onContinue: () => void) => void;
    showRuleToast: (message: string) => void;
  };
  configuration: {
    isAuthenticated: boolean;
    designId: string | null;
    style: string;
    budget: AiLayoutBudget;
    room: {
      width: number;
      depth: number;
      wallThickness: number;
      type?: RoomType | null;
    };
    floorPlanQualityContext: FloorPlanAiPlanningContext;
  };
  refs: {
    getItems: () => DesignItem[];
    createInstanceId: () => string;
    clampToRoom: ClampAiLayoutItem;
  };
};

/**
 * Owns the design page's AI-layout workflow while leaving editor state in the page.
 * The grouped contract keeps history, selection, and guest-prompt ownership explicit.
 */
export function useDesignPageAiLayout({
  state: { seed, pendingProposal },
  actions: {
    setSeed,
    setPendingProposal,
    commitItems,
    clearAllSelection,
    setEditorMode,
    setDesignPanelOpen,
    openGuestPrompt,
    showRuleToast,
  },
  configuration: {
    isAuthenticated,
    designId,
    style,
    budget,
    room,
    floorPlanQualityContext,
  },
  refs: { getItems, createInstanceId, clampToRoom },
}: UseDesignPageAiLayoutParams) {
  const buildItemsFromPlan = useCallback(
    (plan: LayoutPlan) =>
      buildAiLayoutItemsFromPlan({
        plan,
        roomWidth: room.width,
        roomDepth: room.depth,
        wallThickness: room.wallThickness,
        style,
        budget,
        createInstanceId,
        clampToRoom,
      }),
    [budget, clampToRoom, createInstanceId, room.depth, room.wallThickness, room.width, style]
  );

  const queueProposal = useCallback(
    (plan: LayoutPlan, sourceLabel: string) => {
      const { items: proposedItems, appliedRugRule } = buildItemsFromPlan(plan);
      if (proposedItems.length === 0) {
        showRuleToast("Starter layout unavailable. Please add items manually.");
        return;
      }

      const validationResults = proposedItems.map((item) =>
        evaluateConstraints({
          design: { items: proposedItems },
          movedItemId: item.instanceId,
          room: {
            width: room.width,
            depth: room.depth,
            wallThickness: room.wallThickness,
          },
        })
      );
      const { warnings: validationWarnings, validationRisk } =
        collectAiLayoutValidationSummary(validationResults);
      const proposal = buildPendingAiLayoutProposal({
        plan,
        items: proposedItems,
        appliedRugRule,
        sourceLabel,
        style,
        budget,
        validationWarnings,
        validationRisk,
        itemNameByProductId: (productId) => CATALOG_ITEMS[productId]?.title,
      });

      setPendingProposal(proposal);
      setEditorMode("ai");
      setDesignPanelOpen(true);
      showRuleToast("Review AI layout before applying");
      track("ai_layout_proposed", {
        source: sourceLabel,
        seed: plan.meta?.seed ?? null,
        style,
        budget,
        item_count: proposedItems.length,
        fit_risk: proposal.fitRisk ?? null,
      });
    },
    [
      budget,
      buildItemsFromPlan,
      room.depth,
      room.wallThickness,
      room.width,
      setDesignPanelOpen,
      setEditorMode,
      setPendingProposal,
      showRuleToast,
      style,
    ]
  );

  const applyPendingProposal = useCallback(() => {
    if (!pendingProposal) return;

    commitItems(pendingProposal.items, "Apply AI layout proposal");
    clearAllSelection();
    if (pendingProposal.appliedRugRule) {
      showRuleToast("Rug sized to sofa width");
      track("rule_applied", { rule: "rug_size", design_id: designId ?? null });
    } else {
      showRuleToast("AI layout applied");
    }
    track("ai_layout_applied", {
      source: pendingProposal.sourceLabel,
      seed: pendingProposal.seed ?? null,
      style: pendingProposal.style ?? style,
      budget: pendingProposal.budget ?? budget,
      item_count: pendingProposal.items.length,
      fit_risk: pendingProposal.fitRisk ?? null,
    });
    setPendingProposal(null);
  }, [
    budget,
    clearAllSelection,
    commitItems,
    designId,
    pendingProposal,
    setPendingProposal,
    showRuleToast,
    style,
  ]);

  const dismissPendingProposal = useCallback(() => {
    setPendingProposal(null);
  }, [setPendingProposal]);

  const runAiLayout = useCallback(
    async ({
      nextSeed,
      requestedRoles,
    }: {
      nextSeed?: number;
      requestedRoles?: AiLayoutRole[];
    } = {}) => {
      if (!isAuthenticated) {
        openGuestPrompt("ai_layout", () => {});
        return;
      }

      const seedToUse = nextSeed ?? seed;
      if (nextSeed !== undefined) {
        setSeed(nextSeed);
      }
      setPendingProposal(null);

      const catalog = buildAiLayoutCatalogEntries();
      const applyFallbackLayout = (reason: string) => {
        const fallback = buildLocalAiStarterPlan({
          seed: seedToUse,
          requestedRoles,
          style,
          budget,
        });
        const hasCoreStarter = Boolean(
          fallback.picks?.sofa && fallback.picks?.coffee_table
        );
        if (!hasCoreStarter) {
          showRuleToast(reason || "Starter layout unavailable. Please add items manually.");
          return;
        }
        queueProposal(fallback, "Local starter");
        track("ai_layout_fallback_used", {
          reason,
          seed: seedToUse,
          style,
          budget,
        });
      };

      if (room.type && room.type !== "living") {
        showRuleToast("AI layout currently supports living rooms first");
        track("ai_layout_unsupported_room_type", {
          room_type: room.type,
          seed: seedToUse,
          style,
          budget,
        });
        return;
      }

      const requiredCategoryCounts = getRequiredAiLayoutCatalogCounts(catalog);
      if (!requiredCategoryCounts.sofa || !requiredCategoryCounts.coffee_table) {
        const reasons: string[] = [];
        if (!requiredCategoryCounts.sofa) reasons.push("no live-approved sofa available");
        if (!requiredCategoryCounts.coffee_table) {
          reasons.push("no live-approved coffee_table available");
        }
        applyFallbackLayout(`Starter plan failed validation: ${reasons.join(", ")}`);
        return;
      }

      try {
        const response = await fetch("/api/ai/layout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomWidth: room.width,
            roomDepth: room.depth,
            roomType: room.type ?? "living",
            style,
            budget,
            seed: seedToUse,
            requestedRoles,
            catalog,
            floorPlanQualityContext,
          }),
        });
        const plan = await response.json();

        if (!response.ok) {
          if (plan?.code === "unsupported_room_type") {
            showRuleToast("AI layout currently supports living rooms first");
            track("ai_layout_unsupported_room_type", {
              room_type: plan?.meta?.roomType ?? room.type ?? "unknown",
              seed: seedToUse,
              style,
              budget,
            });
            return;
          }
          applyFallbackLayout(plan?.error ?? "AI failed");
          return;
        }

        const issues = describeAiStarterValidationIssues(plan);
        if (issues.length > 0) {
          applyFallbackLayout(`Starter plan failed validation: ${issues.join("; ")}`);
          return;
        }

        queueProposal(plan, "AI starter");
        if (plan?.quality?.fitRisk && plan.quality.fitRisk !== "low") {
          showRuleToast(
            plan.quality.fitRisk === "high"
              ? "AI layout needs fit review"
              : "AI layout fits tightly"
          );
          track("ai_layout_fit_warning", {
            fit_risk: plan.quality.fitRisk,
            warnings: plan.quality.warnings ?? [],
            seed: seedToUse,
            style,
            budget,
          });
        }
      } catch (error) {
        applyFallbackLayout(error instanceof Error ? error.message : "AI failed");
      }
    },
    [
      budget,
      floorPlanQualityContext,
      isAuthenticated,
      openGuestPrompt,
      queueProposal,
      room.depth,
      room.type,
      room.width,
      seed,
      setPendingProposal,
      setSeed,
      showRuleToast,
      style,
    ]
  );

  const regenerateAiLayout = useCallback(
    (requestedRoles?: AiLayoutRole[]) =>
      runAiLayout({ nextSeed: getRandomAiLayoutSeed(), requestedRoles }),
    [runAiLayout]
  );

  const bulkSwap = useCallback(
    (direction: "cheaper" | "premium") => {
      const historyLabel =
        direction === "cheaper" ? "Make room cheaper" : "Make room premium";
      commitItems(
        (currentItems) => bulkSwapItems({ items: currentItems, style, direction }),
        historyLabel
      );
    },
    [commitItems, style]
  );

  const resizeRugToSofaRule = useCallback(
    (sofaItem: DesignItem) => {
      const sofaProduct = CATALOG_ITEMS[sofaItem.productId];
      if (!sofaProduct) {
        throw new Error("No sofa found to size rug against.");
      }

      const bestRug = pickBestRugForSofa({
        sofaWidth: sofaProduct.dimsMm.w / 1000,
        style,
        budget,
      });
      if (!bestRug) {
        throw new Error("No rug available for this style and budget.");
      }

      const sofaX = sofaItem.position?.[0] ?? 0;
      const sofaZ = sofaItem.position?.[2] ?? -1.4;
      const rugZ = sofaZ + (sofaProduct.dimsMm.d / 1000) * 0.35;
      let hasRug = false;
      const nextItems = getItems().map((item) => {
        if (CATALOG_ITEMS[item.productId]?.category !== "rug") return item;
        hasRug = true;
        return {
          ...item,
          productId: bestRug.id,
          variantId: bestRug.defaultVariantId,
        };
      });

      if (!hasRug) {
        const [safeX, safeZ] = clampToRoom(
          sofaX,
          rugZ,
          bestRug.dimsMm.w / 1000,
          bestRug.dimsMm.d / 1000,
          room.width,
          room.depth,
          room.wallThickness,
          0
        );
        nextItems.push({
          instanceId: createInstanceId(),
          productId: bestRug.id,
          variantId: bestRug.defaultVariantId,
          position: [safeX, 0, safeZ],
          rotationY: 0,
          qty: 1,
          includeInCheckout: true,
        });
      }

      showRuleToast("Rug sized to sofa width");
      track("rule_applied", { rule: "rug_size", design_id: designId ?? null });
      return { items: nextItems };
    },
    [
      budget,
      clampToRoom,
      createInstanceId,
      designId,
      getItems,
      room.depth,
      room.wallThickness,
      room.width,
      showRuleToast,
      style,
    ]
  );

  return {
    actions: {
      applyPendingProposal,
      dismissPendingProposal,
      runAiLayout,
      regenerateAiLayout,
      bulkSwap,
      resizeRugToSofaRule,
    },
  };
}
