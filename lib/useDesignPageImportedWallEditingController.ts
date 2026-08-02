"use client";

import {
  useCallback,
  useRef,
  useState,
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

type FunctionalStateAction<T> = T | ((previous: T) => T);

export type ImportedWallEditingState = {
  available: boolean;
  confirmationPending: boolean;
  editingEnabled: boolean;
  isLocalFork: boolean;
  sourceRevisionId: string | null;
  localRevisionId: string | null;
  document: FloorPlanDocumentV2 | null;
};

export type ImportedWallEditingActions = {
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
  move_vertex: "Move imported wall endpoint",
  move_wall: "Move imported wall",
  update_wall: "Update imported wall",
  split_wall: "Split imported wall",
};

function stableIdPart(value: string): string {
  return value.replace(/[^A-Za-z0-9_.:-]/g, "-");
}

export function useDesignPageImportedWallEditingController({
  state,
  refs,
  actions,
}: UseDesignPageImportedWallEditingControllerInput): DesignPageImportedWallEditingController {
  const [wallEditSession, setWallEditSession] = useState({
    sessionKey: "none",
    confirmationPending: false,
    editingEnabled: false,
  });
  const sequenceRef = useRef(0);
  const document = state.designSnapshot.floorPlan?.canonicalDocument ?? null;
  const sourceRevisionId = document
    ? state.designSnapshot.floorPlan?.revisionId ??
      document.parentRevisionId ??
      document.revisionId
    : null;
  const sessionKey = document && sourceRevisionId
    ? `${document.id}:${sourceRevisionId}`
    : "none";
  const available = Boolean(
    document && state.canEdit && !state.isClientPreview && state.viewMode === "2d"
  );
  const sessionIsCurrent = wallEditSession.sessionKey === sessionKey;
  const confirmationPending = Boolean(
    available && sessionIsCurrent && wallEditSession.confirmationPending
  );
  const editingEnabled = Boolean(
    available && sessionIsCurrent && wallEditSession.editingEnabled
  );

  const nextIdentity = useCallback((kind: ConsumerWallTopologyMutationV2["kind"]) => {
    sequenceRef.current += 1;
    const timestamp = Date.now();
    const suffix = `${timestamp.toString(36)}:${sequenceRef.current}`;
    return {
      timestamp,
      suffix,
      mutationId: `consumer-wall-edit:${kind}:${suffix}`,
      revisionId: `local-floor-plan:${suffix}`,
    };
  }, []);

  const commit = useCallback(
    (operation: ConsumerWallTopologyMutationV2): boolean => {
      if (!editingEnabled || !available) {
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
        actions.showToast(
          `Wall change blocked: ${
            cause instanceof Error ? cause.message : "The geometry is not valid."
          }`
        );
        return false;
      }
    },
    [actions, available, editingEnabled, nextIdentity, refs.designSnapshot]
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
      requestEditing: () => {
        if (!available) return;
        setWallEditSession({
          sessionKey,
          confirmationPending: true,
          editingEnabled: false,
        });
      },
      cancelEditingRequest: () =>
        setWallEditSession({
          sessionKey,
          confirmationPending: false,
          editingEnabled: false,
        }),
      confirmEditing: () => {
        if (!available || !confirmationPending) return;
        setWallEditSession({
          sessionKey,
          confirmationPending: false,
          editingEnabled: true,
        });
      },
      stopEditing: () =>
        setWallEditSession({
          sessionKey,
          confirmationPending: false,
          editingEnabled: false,
        }),
      moveVertex,
      moveWall,
      updateWall,
      splitWall,
    },
  };
}
