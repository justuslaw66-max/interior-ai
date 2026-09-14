"use client";

import {
  useCallback,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type {
  FloorPlanDocumentV2,
  FloorPlanWallClassificationV2,
} from "@/lib/floor-plan-document-v2";
import {
  applyConfirmedConsumerWallEditV2,
  isConsumerWallEditLocalForkV2,
  type ConsumerWallTopologyMutationV2,
} from "@/lib/floor-plan-consumer-wall-edit";
import type { FixedElement2D, RoomOpening2D } from "@/lib/editorScene";
import type { DesignSnapshot } from "@/lib/room-types";
import { proposedWallEditFailureMessage } from "@/lib/floor-plan-wall-edit-feedback";
import { commitCurrentWallGesture } from "@/lib/floor-plan-wall-gesture";
import { useDesignPageWallEditSession } from "@/lib/useDesignPageWallEditSession";
import { useDesignPageRoomRecovery } from "@/lib/useDesignPageRoomRecovery";
import type { RecoverProposedRoomLayoutInput } from "@/lib/floor-plan-room-recovery";

type FunctionalStateAction<T> = T | ((previous: T) => T);

export type ImportedWallEditingState = {
  selection: { floorId: string; wallId: string };
  proposal: NonNullable<DesignSnapshot["floorPlan"]>["proposal"];
  available: boolean;
  confirmationPending: boolean;
  editingEnabled: boolean;
  isLocalFork: boolean;
  sourceRevisionId: string | null;
  localRevisionId: string | null;
  document: FloorPlanDocumentV2 | null;
};

export type ImportedWallEditingActions = {
  selectWall: (floorId: string, wallId: string) => void;
  commitWallGesture: (operation: ConsumerWallTopologyMutationV2, expectedRevisionId: string) => boolean;
  recoverLayout: (input: RecoverProposedRoomLayoutInput) => boolean;
  applyProposalMutation: (operation: ConsumerWallTopologyMutationV2) => boolean;
  requestEditing: () => void;
  cancelEditingRequest: () => void;
  confirmEditing: () => void;
  stopEditing: () => void;
  moveVertex: (input: {
    floorId: string;
    vertexId: string;
    xMm: number;
    zMm: number;
  }) => boolean;
  moveWall: (input: {
    floorId: string;
    wallId: string;
    deltaXMm: number;
    deltaZMm: number;
  }) => boolean;
  updateWall: (input: {
    floorId: string;
    wallId: string;
    thicknessMm: number;
    classification: FloorPlanWallClassificationV2;
  }) => boolean;
  splitWall: (input: {
    floorId: string;
    wallId: string;
    offsetMm: number;
  }) => boolean;
};

export type DesignPageImportedWallEditingController = {
  state: ImportedWallEditingState;
  actions: ImportedWallEditingActions;
};

export type UseDesignPageImportedWallEditingControllerInput = {
  state: {
    designSnapshot: DesignSnapshot;
    canEdit: boolean;
    isClientPreview: boolean;
    viewMode: "2d" | "3d";
  };
  refs: { designSnapshot: MutableRefObject<DesignSnapshot> };
  actions: {
    setDesignSnapshot: Dispatch<SetStateAction<DesignSnapshot>>;
    setPlanOpenings: (next: FunctionalStateAction<RoomOpening2D[]>) => void;
    setPlanFixedElements: (next: FunctionalStateAction<FixedElement2D[]>) => void;
    runHistoryTransaction: (name: string, mutation: () => void) => void;
    showToast: (message: string) => void;
  };
};

const ACTION_LABELS: Record<ConsumerWallTopologyMutationV2["kind"], string> = {
  add_wall: "Add proposed wall", remove_wall: "Remove proposed wall",
  add_opening: "Add proposed opening", update_opening: "Edit proposed opening", remove_opening: "Remove proposed opening",
  move_vertex: "Move imported wall endpoint",
  move_wall: "Move imported wall",
  update_wall: "Update imported wall",
  split_wall: "Split imported wall", join_wall_endpoint: "Join proposed wall endpoint",
};

function stableIdPart(value: string): string {
  return value.replace(/[^A-Za-z0-9_.:-]/g, "-");
}

export function useDesignPageImportedWallEditingController({
  state,
  refs,
  actions,
}: UseDesignPageImportedWallEditingControllerInput): DesignPageImportedWallEditingController {
  const session = useDesignPageWallEditSession(state);
  const { document, sourceRevisionId, available, confirmationPending, editingEnabled, nextIdentity } = session;
  const recoverLayout = useDesignPageRoomRecovery({ enabled: editingEnabled, refs, actions });

  const commit = useCallback(
    (operation: ConsumerWallTopologyMutationV2): boolean => {
      if (!editingEnabled) {
        actions.showToast("Choose Edit local copy before changing imported walls");
        return false;
      }
      const snapshot = refs.designSnapshot.current;
      const wasLocalFork = isConsumerWallEditLocalForkV2(snapshot);
      const identity = nextIdentity(operation.kind);
      try {
        const committed = applyConfirmedConsumerWallEditV2({
          snapshot,
          operation,
          sourceEditConfirmed: true,
          context: {
            mutationId: identity.mutationId,
            nextRevisionId: identity.revisionId,
            actorId: "design-editor",
            mutatedAt: new Date(identity.timestamp).toISOString(),
            note:
              "Consumer explicitly edited a local copy; the imported source revision remains unchanged.",
          },
        });
        actions.runHistoryTransaction(ACTION_LABELS[operation.kind], () => {
          actions.setDesignSnapshot(committed.snapshot);
          actions.setPlanOpenings(committed.openings);
          actions.setPlanFixedElements(committed.fixedElements);
        });
        actions.showToast(
          wasLocalFork
            ? "Local floor plan updated"
            : "Local editable floor plan created; imported source unchanged"
        );
        return true;
      } catch (cause) {
        actions.showToast(`Wall change blocked: ${proposedWallEditFailureMessage(cause)}`);
        return false;
      }
    },
    [actions, editingEnabled, nextIdentity, refs.designSnapshot]
  );

  const moveVertex = useCallback<ImportedWallEditingActions["moveVertex"]>(
    ({ floorId, vertexId, xMm, zMm }) =>
      commit({ kind: "move_vertex", floorId, vertexId, to: { xMm, zMm } }),
    [commit]
  );
  const moveWall = useCallback<ImportedWallEditingActions["moveWall"]>(
    ({ floorId, wallId, deltaXMm, deltaZMm }) =>
      commit({ kind: "move_wall", floorId, wallId, deltaXMm, deltaZMm }),
    [commit]
  );
  const updateWall = useCallback<ImportedWallEditingActions["updateWall"]>(
    ({ floorId, wallId, thicknessMm, classification }) =>
      commit({
        kind: "update_wall",
        floorId,
        wallId,
        changes: { thicknessMm, classification },
      }),
    [commit]
  );
  const splitWall = useCallback<ImportedWallEditingActions["splitWall"]>(
    ({ floorId, wallId, offsetMm }) => {
      const identity = nextIdentity("split_wall");
      const idBase = stableIdPart(`${wallId}:${identity.suffix}`);
      return commit({
        kind: "split_wall",
        floorId,
        wallId,
        offsetMm,
        newVertexId: `consumer-split-vertex:${idBase}`,
        newWallId: `consumer-split-wall:${idBase}`,
      });
    },
    [commit, nextIdentity]
  );

  return {
    state: {
      selection: session.selection,
      proposal: state.designSnapshot.floorPlan?.proposal,
      available,
      confirmationPending,
      editingEnabled,
      isLocalFork: isConsumerWallEditLocalForkV2(state.designSnapshot),
      sourceRevisionId,
      localRevisionId:
        document && document.revisionId !== sourceRevisionId
          ? document.revisionId
          : null,
      document: available ? document : null,
    },
    actions: {
      applyProposalMutation: commit,
      ...session.actions,
      commitWallGesture: (operation, revisionId) => commitCurrentWallGesture(refs.designSnapshot.current, revisionId, operation, commit, actions.showToast),
      moveVertex, moveWall, updateWall, splitWall, recoverLayout,
    },
  };
}
