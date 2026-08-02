"use client";

import type { MutableRefObject } from "react";

import type { DesignPageDocumentRoomRegistration } from "@/lib/useDesignPageDocumentRoomRegistration";
import {
  DESIGN_PAGE_LOCAL_BACKUP_STORAGE_KEY,
  type UseDesignPageLocalBackupHydrationInput,
} from "@/lib/useDesignPageLocalBackupHydration";
import { useDesignPageLateBoundRef } from "@/lib/useDesignPageLateBoundRef";
import {
  useDesignPagePersistenceNewPlanFacade,
  type UseDesignPagePersistenceNewPlanFacadeInput,
} from "@/lib/useDesignPagePersistenceNewPlanFacade";
import type { useDesignPageSnapshotDocumentState } from "@/lib/useDesignPageDocumentStateController";

type PersistenceFacadeInput = UseDesignPagePersistenceNewPlanFacadeInput;
type PersistenceActions = PersistenceFacadeInput["actions"]["persistence"];
type NewPlanActions = PersistenceFacadeInput["actions"]["newPlan"];
type SnapshotDocumentBoundary = ReturnType<
  typeof useDesignPageSnapshotDocumentState
>;
type LocalBackupPersistenceActions = Pick<
  UseDesignPageLocalBackupHydrationInput["actions"],
  "loadDesign" | "clearPersistedSnapshotFingerprint"
>;

export type UseDesignPagePersistenceRegistrationInput = {
  boundaries: {
    snapshotDocument: SnapshotDocumentBoundary;
    documentRoom: DesignPageDocumentRoomRegistration;
  };
  state: {
    identity: PersistenceFacadeInput["state"]["identity"];
    document: Pick<
      PersistenceFacadeInput["state"]["document"],
      "savedViews" | "style" | "budget" | "mode" | "notes"
    >;
    session: PersistenceFacadeInput["state"]["session"];
    newPlan: PersistenceFacadeInput["state"]["newPlan"];
  };
  actions: {
    persistence: Omit<
      PersistenceActions,
      "setDesignSnapshot" | "hydratePersistedFloorPlanState" | "clearHistory"
    >;
    newPlan: Omit<NewPlanActions, "clearHistory" | "clearPlanAnnotations">;
    clearPlanAnnotations: NewPlanActions["clearPlanAnnotations"];
  };
  refs: {
    localBackupPersistenceActions: MutableRefObject<
      LocalBackupPersistenceActions
    >;
  };
};

/**
 * Registers persistence before the new-plan transaction and then binds the
 * mount-time local-backup bridge. Document-owned state, history, hydration,
 * and serialization adapters are read from their existing boundaries.
 */
export function useDesignPagePersistenceRegistration({
  boundaries: { snapshotDocument, documentRoom },
  state,
  actions,
  refs: { localBackupPersistenceActions },
}: UseDesignPagePersistenceRegistrationInput) {
  const history = documentRoom.refs.documentHistory.history;
  const persistenceNewPlan = useDesignPagePersistenceNewPlanFacade({
    state: {
      identity: state.identity,
      document: {
        designSnapshot: snapshotDocument.state.designSnapshot,
        currentStoredDesignFingerprint:
          documentRoom.state.document.currentStoredDesignFingerprint,
        items: documentRoom.derived.room.items,
        zones: documentRoom.derived.room.zones,
        roomWidth: documentRoom.derived.room.roomWidth,
        roomDepth: documentRoom.derived.room.roomDepth,
        ...state.document,
      },
      session: state.session,
      lifecycle: {
        localBackupHydrated: snapshotDocument.state.localBackupHydrated,
      },
      newPlan: state.newPlan,
    },
    actions: {
      persistence: {
        ...actions.persistence,
        setDesignSnapshot: snapshotDocument.actions.setDesignSnapshot,
        hydratePersistedFloorPlanState:
          documentRoom.actions.history.hydratePersistedFloorPlanState,
        clearHistory: () => history.clear(),
      },
      newPlan: {
        ...actions.newPlan,
        clearHistory: () => history.clear(),
        clearPlanAnnotations: actions.clearPlanAnnotations,
      },
    },
    configuration: {
      storageKey: DESIGN_PAGE_LOCAL_BACKUP_STORAGE_KEY,
      cloudSaveDelayMs: 900,
      guestSaveDelayMs: 800,
    },
    refs: {
      getStoredDesignForPersistence:
        documentRoom.refs.documentHistory.getStoredDesignForPersistence,
      fingerprintStoredDesign:
        documentRoom.refs.documentHistory.fingerprintStoredDesign,
    },
  });

  useDesignPageLateBoundRef(localBackupPersistenceActions, {
    loadDesign: persistenceNewPlan.actions.persistence.loadDesign,
    clearPersistedSnapshotFingerprint:
      persistenceNewPlan.actions.persistence
        .clearPersistedSnapshotFingerprint,
  });

  return persistenceNewPlan;
}
