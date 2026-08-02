"use client";

import {
  useDesignPageDocumentHistoryWorkspace,
  type UseDesignPageDocumentHistoryWorkspaceInput,
} from "@/lib/useDesignPageDocumentHistoryWorkspace";
import {
  useDesignPageRoomFloorWorkspace,
  type UseDesignPageRoomFloorWorkspaceInput,
} from "@/lib/useDesignPageRoomFloorWorkspace";

type DocumentHistoryInput = UseDesignPageDocumentHistoryWorkspaceInput;
type RoomFloorInput = UseDesignPageRoomFloorWorkspaceInput;

export type UseDesignPageDocumentRoomRegistrationInput = {
  boundaries: DocumentHistoryInput["boundaries"];
  state: Omit<RoomFloorInput["state"], "document">;
  configuration: RoomFloorInput["configuration"];
  refs: Omit<RoomFloorInput["refs"], "designSnapshotRef" | "history">;
  actions: {
    history: DocumentHistoryInput["actions"];
    plan: RoomFloorInput["actions"]["plan"];
    feedback: RoomFloorInput["actions"]["feedback"];
  };
};

/**
 * Registers document history before room and floor orchestration at the
 * workspace's established hook slot. Document-owned actions and refs are
 * adapted internally so callers can pass the existing grouped boundaries.
 */
export function useDesignPageDocumentRoomRegistration({
  boundaries,
  state,
  configuration,
  refs,
  actions,
}: UseDesignPageDocumentRoomRegistrationInput) {
  const documentHistory = useDesignPageDocumentHistoryWorkspace({
    boundaries,
    actions: actions.history,
  });

  const roomFloor = useDesignPageRoomFloorWorkspace({
    state: {
      document: {
        designSnapshot: boundaries.snapshot.state.designSnapshot,
      },
      ...state,
    },
    configuration,
    refs: {
      ...refs,
      designSnapshotRef: boundaries.snapshot.refs.designSnapshotRef,
      history: documentHistory.refs.history,
    },
    actions: {
      document: {
        setDesignSnapshot: boundaries.snapshot.actions.setDesignSnapshot,
        setPlanOpenings: boundaries.plan.actions.setPlanOpenings,
      },
      history: {
        runTransaction: documentHistory.actions.runHistoryTransaction,
      },
      plan: actions.plan,
      feedback: actions.feedback,
    },
  });

  return {
    boundaries: {
      document: boundaries,
      history: documentHistory,
      roomFloor,
      house: roomFloor.boundaries.house,
      floor: roomFloor.boundaries.floor,
    },
    state: {
      document: documentHistory.state,
      room: roomFloor.state.room,
      floor: roomFloor.state.floor,
      plan: roomFloor.state.plan,
    },
    derived: roomFloor.derived,
    configuration: roomFloor.configuration,
    refs: {
      documentHistory: documentHistory.refs,
      roomFloor: roomFloor.refs,
    },
    actions: {
      history: documentHistory.actions,
      room: roomFloor.actions.room,
      floor: roomFloor.actions.floor,
      plan: roomFloor.actions.plan,
    },
  };
}

export type DesignPageDocumentRoomRegistration = ReturnType<
  typeof useDesignPageDocumentRoomRegistration
>;
