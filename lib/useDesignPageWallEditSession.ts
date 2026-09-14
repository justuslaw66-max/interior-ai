"use client";

import { useCallback, useRef, useState } from "react";
import type { DesignSnapshot } from "@/lib/room-types";
import type { ConsumerWallTopologyMutationV2 } from "@/lib/floor-plan-consumer-wall-edit";

function useWallMutationIdentity() {
  const sequence = useRef(0);
  return useCallback((kind: ConsumerWallTopologyMutationV2["kind"]) => {
    sequence.current += 1;
    const timestamp = Date.now(), suffix = `${timestamp.toString(36)}:${sequence.current}`;
    return { timestamp, suffix, mutationId: `consumer-wall-edit:${kind}:${suffix}`, revisionId: `local-floor-plan:${suffix}` };
  }, []);
}

type SessionInput = { designSnapshot: DesignSnapshot; canEdit: boolean; isClientPreview: boolean; viewMode: "2d" | "3d" };

function wallSessionContext({ designSnapshot, canEdit, isClientPreview, viewMode }: SessionInput) {
  const document = designSnapshot.floorPlan?.canonicalDocument ?? null;
  const sourceRevisionId = document ? designSnapshot.floorPlan?.revisionId ?? document.parentRevisionId ?? document.revisionId : null;
  return { document, sourceRevisionId, key: document && sourceRevisionId ? `${document.id}:${sourceRevisionId}` : "none",
    available: Boolean(document && canEdit && !isClientPreview && viewMode === "2d") };
}

/** One confirmation/selection session shared by the numeric controls and main viewport. */
export function useDesignPageWallEditSession(input: SessionInput) {
  const [session, setSession] = useState({ key: "none", confirmationPending: false, editingEnabled: false });
  const [selected, setSelected] = useState({ documentId: "", floorId: "", wallId: "" });
  const nextIdentity = useWallMutationIdentity();
  const { document, sourceRevisionId, key, available } = wallSessionContext(input);
  const confirmationPending = available && session.key === key && session.confirmationPending;
  const editingEnabled = available && session.key === key && session.editingEnabled;
  const currentSelection = selected.documentId === document?.id ? selected : { floorId: "", wallId: "" };
  const floor = document?.floors.find(({ id }) => id === currentSelection.floorId) ?? document?.floors[0];
  const wall = floor?.walls.find(({ id }) => id === currentSelection.wallId) ?? floor?.walls[0];
  const selectWall = (floorId: string, wallId: string) => {
    if (document?.floors.some((floor) => floor.id === floorId && floor.walls.some(({ id }) => id === wallId))) {
      setSelected({ documentId: document.id, floorId, wallId });
    }
  };
  return { document, sourceRevisionId, available, confirmationPending, editingEnabled, nextIdentity,
    selection: { floorId: floor?.id ?? "", wallId: wall?.id ?? "" },
    actions: {
      selectWall,
      requestEditing: () => { if (available) setSession({ key, confirmationPending: true, editingEnabled: false }); },
      cancelEditingRequest: () => setSession({ key, confirmationPending: false, editingEnabled: false }),
      confirmEditing: () => { if (available && confirmationPending) setSession({ key, confirmationPending: false, editingEnabled: true }); },
      stopEditing: () => setSession({ key, confirmationPending: false, editingEnabled: false }),
    },
  };
}
