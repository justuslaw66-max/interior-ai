"use client";

import { buildRoomWallDescriptors } from "@/lib/design-page-wall-descriptors";
import type { DesignPageCoreShellRegistration } from "@/lib/useDesignPageCoreShellRegistration";
import type { DesignPageDocumentSelectionRegistrationFacade } from "@/lib/useDesignPageDocumentSelectionRegistrationFacade";
import type { DesignPageEditorInteractionRegistration } from "@/lib/useDesignPageEditorInteractionRegistration";
import { useDesignPageAiPanelRegistrationFacade } from "@/lib/useDesignPageAiPanelRegistrationFacade";
import type { DesignPagePersistenceWorkspaceRegistration } from "@/lib/useDesignPagePersistenceWorkspaceRegistration";
import type { DesignPagePlanAuthoringRegistration } from "@/lib/useDesignPagePlanAuthoringRegistration";

export type UseDesignPageAiWorkspaceRegistrationInput = {
  boundaries: {
    coreShell: DesignPageCoreShellRegistration;
    documentSelection: DesignPageDocumentSelectionRegistrationFacade;
    planAuthoring: DesignPagePlanAuthoringRegistration;
    editorInteraction: DesignPageEditorInteractionRegistration;
    persistence: DesignPagePersistenceWorkspaceRegistration;
  };
};

/**
 * Registers AI layout, panel, and notes behavior after persistence while
 * preserving the existing item, selection, surface, and camera owners.
 */
export function useDesignPageAiWorkspaceRegistration({
  boundaries: {
    coreShell,
    documentSelection,
    planAuthoring,
    editorInteraction,
    persistence,
  },
}: UseDesignPageAiWorkspaceRegistrationInput) {
  const base = coreShell.boundaries.base;
  const viewportShell = coreShell.boundaries.viewportShell;
  const editorShell = viewportShell.boundaries.editorShell;
  const { documentRoom, sceneRoomRead, itemSelection, itemDocument } =
    documentSelection.boundaries;
  const { selectionInspection, planWorkspace, surfaceWorkspace } =
    planAuthoring.boundaries;
  const camera = editorInteraction.boundaries.camera;
  const { activeRoom, roomWidth, roomDepth, wallThickness, items } =
    documentRoom.derived.room;
  const walls = buildRoomWallDescriptors({
    roomWidth,
    roomDepth,
    wallThickness,
  });

  const aiPanel = useDesignPageAiPanelRegistrationFacade({
    state: {
      layout: {
        seed: base.state.brief.aiSeed,
        pendingProposal: coreShell.state.placement.pendingAiLayoutProposal,
      },
      panel: {
        activeRoomId: activeRoom?.id ?? null,
        activeSurfaceTarget: editorShell.state.surface.activeSurfaceTarget,
        selectedWallFaceId:
          sceneRoomRead.derived.room.activeSelectedWallFaceId,
        items,
      },
      notes: { designerMode: coreShell.derived.access.isDesigner },
    },
    actions: {
      layout: {
        setSeed: base.actions.brief.setAiSeed,
        setPendingProposal:
          coreShell.actions.placement.setPendingAiLayoutProposal,
        commitItems: itemDocument.actions.commitItems,
        clearAllSelection:
          selectionInspection.actions.selection.clearAllSelection,
        setEditorMode: editorShell.actions.editor.setEditorMode,
        setDesignPanelOpen: base.actions.panels.setDesignPanelOpen,
        openGuestPrompt: persistence.actions.persistence.openGuestPrompt,
        showRuleToast: coreShell.actions.feedback.showRuleToast,
      },
      panel: {
        setClientPreview: base.actions.access.setClientPreview,
        setDesignPanelCollapsed:
          base.actions.panels.setDesignPanelCollapsed,
        setDesignPanelOpen: base.actions.panels.setDesignPanelOpen,
        setShowGrid: base.actions.editor.setShowGrid,
        setSnapEnabled: base.actions.editor.setSnapEnabled,
        setItemCartOpen: base.actions.panels.setItemCartOpen,
        changeViewMode: camera.actions.navigation.handleEditorViewModeChange,
        changeWallSurfaceSettings:
          surfaceWorkspace.actions.changeActiveWallSurfaceSettings,
        resetWallSurface:
          surfaceWorkspace.actions.resetActiveWallSurface,
        resetCeilingSurface:
          surfaceWorkspace.actions.resetActiveCeilingSurface,
      },
      notes: { addItem: itemDocument.actions.addItem },
      selection: { updateSelection: itemSelection.actions.updateSelection },
    },
    configuration: {
      isAuthenticated: Boolean(base.state.identity.session?.user),
      designId: base.state.identity.designId,
      style: base.state.brief.style,
      budget: base.state.brief.budget,
      room: {
        width: roomWidth,
        depth: roomDepth,
        wallThickness,
        type: activeRoom?.roomType,
      },
      floorPlanQualityContext:
        planWorkspace.state.quality.report.aiPlanningContext,
    },
    refs: {
      items: coreShell.refs.itemsRef,
      layout: {
        createInstanceId: itemDocument.actions.createInstanceId,
        clampToRoom: documentRoom.actions.room.clampToActiveRoom,
      },
      panel: {
        selectedIds: itemSelection.refs.selectedIds,
        primaryId: itemSelection.refs.primaryId,
      },
    },
  });

  return {
    boundaries: {
      coreShell,
      documentSelection,
      planAuthoring,
      editorInteraction,
      persistence,
      aiPanel,
    },
    state: aiPanel.state,
    derived: { walls },
    configuration: {},
    refs: {},
    actions: aiPanel.actions,
  };
}

export type DesignPageAiWorkspaceRegistration = ReturnType<
  typeof useDesignPageAiWorkspaceRegistration
>;
