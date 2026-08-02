"use client";

import { useCallback, type MutableRefObject } from "react";

import type { DesignItem } from "@/lib/room-types";
import {
  useDesignPageAiLayout,
  type UseDesignPageAiLayoutParams,
} from "@/lib/useDesignPageAiLayout";
import { useDesignPageAiNotes } from "@/lib/useDesignPageAiNotes";
import {
  useDesignPagePanelActions,
  type DesignPagePanelActionAdapters,
  type DesignPagePanelActionsState,
  type UseDesignPagePanelActionsInput,
} from "@/lib/useDesignPagePanelActions";

type AiLayoutActions = UseDesignPageAiLayoutParams["actions"];
type PanelActionAdapters = DesignPagePanelActionAdapters;

export type UseDesignPageAiPanelRegistrationFacadeInput = {
  state: {
    layout: UseDesignPageAiLayoutParams["state"];
    panel: DesignPagePanelActionsState;
    notes: {
      designerMode: boolean;
    };
  };
  actions: {
    layout: AiLayoutActions;
    panel: Omit<
      PanelActionAdapters,
      "runAiLayout" | "regenerateAiLayout" | "commitItems" | "updateSelection"
    >;
    notes: {
      addItem: (productId: string, position: [number, number, number]) => void;
    };
    selection: Pick<PanelActionAdapters, "updateSelection">;
  };
  configuration: UseDesignPageAiLayoutParams["configuration"];
  refs: {
    items: MutableRefObject<DesignItem[]>;
    layout: Omit<UseDesignPageAiLayoutParams["refs"], "getItems">;
    panel: UseDesignPagePanelActionsInput["refs"];
  };
};

export type DesignPageAiPanelRegistrationFacade = {
  boundaries: {
    panel: ReturnType<typeof useDesignPagePanelActions>;
  };
  state: {
    notes: ReturnType<typeof useDesignPageAiNotes>["state"];
  };
  actions: {
    layout: ReturnType<typeof useDesignPageAiLayout>["actions"];
    notes: ReturnType<typeof useDesignPageAiNotes>["actions"];
  };
};

/**
 * Preserves the AI-layout, panel-action, and AI-notes registration slot.
 * Domain behavior remains in the focused hooks composed here.
 */
export function useDesignPageAiPanelRegistrationFacade({
  state,
  actions,
  configuration,
  refs: {
    items: itemsRef,
    layout: { createInstanceId, clampToRoom },
    panel: { selectedIds: selectedIdsRef, primaryId: primaryIdRef },
  },
}: UseDesignPageAiPanelRegistrationFacadeInput): DesignPageAiPanelRegistrationFacade {
  const layout = useDesignPageAiLayout({
    state: state.layout,
    actions: actions.layout,
    configuration,
    refs: {
      getItems: () => itemsRef.current,
      createInstanceId,
      clampToRoom,
    },
  });

  const panel = useDesignPagePanelActions({
    state: state.panel,
    refs: { selectedIds: selectedIdsRef, primaryId: primaryIdRef },
    actions: {
      ...actions.panel,
      runAiLayout: layout.actions.runAiLayout,
      regenerateAiLayout: layout.actions.regenerateAiLayout,
      commitItems: actions.layout.commitItems,
      updateSelection: actions.selection.updateSelection,
    },
  });

  const getAiNotesItems = useCallback(() => itemsRef.current, [itemsRef]);
  const notes = useDesignPageAiNotes({
    state: {
      items: state.panel.items,
      designId: configuration.designId,
      designerMode: state.notes.designerMode,
      authenticated: configuration.isAuthenticated,
    },
    actions: {
      getItems: getAiNotesItems,
      resizeRugToSofa: layout.actions.resizeRugToSofaRule,
      makeRoomCheaper: () => layout.actions.bulkSwap("cheaper"),
      addItem: actions.notes.addItem,
      commitItems: (nextItems, actionName) =>
        actions.layout.commitItems(nextItems, actionName),
      showToast: actions.layout.showRuleToast,
    },
  });

  return {
    boundaries: { panel },
    state: { notes: notes.state },
    actions: {
      layout: layout.actions,
      notes: notes.actions,
    },
  };
}
