"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";

import {
  acknowledgePendingCloudBaseline,
  beginCloudBaselineLoad,
  cancelCloudBaselineLoad,
  createDetachedCloudBaseline,
  failCloudBaselineLoad,
  installPendingCloudBaseline,
  isCloudWriteBlocked,
  stagePendingCloudWriteBaseline,
  type CloudBaselineIdentity,
  type CloudBaselineState,
} from "@/lib/design-page-cloud-baseline";
import type { DesignPageCloudWriteRequestIdentity } from "@/lib/design-page-cloud-write-queue";

type BaselineControllerInput = {
  designId: string | null;
  revision: string | null;
  currentFingerprint: string;
  acknowledgeFingerprint: (fingerprint: string) => void;
  finishSaving: (writeRequest: DesignPageCloudWriteRequestIdentity | null) => void;
  documentEpochRef: MutableRefObject<number>;
};

type BaselineStore = ReturnType<typeof useCloudBaselineStore>;

function pendingBaselineMatches(
  state: CloudBaselineState,
  input: {
    identity: CloudBaselineIdentity;
    fingerprint: string;
    requireFingerprintMatch: boolean;
    writeRequest: DesignPageCloudWriteRequestIdentity | null;
    includeLoadingPrevious?: boolean;
  }
): boolean {
  const candidate = state.status === "loading" && input.includeLoadingPrevious
    ? state.previous
    : state;
  return candidate.status === "pending" &&
    candidate.identity.designId === input.identity.designId &&
    candidate.identity.revision === input.identity.revision &&
    candidate.identity.epoch === input.identity.epoch &&
    candidate.fingerprint === input.fingerprint &&
    candidate.requireFingerprintMatch === input.requireFingerprintMatch &&
    candidate.writeRequest?.requestId === input.writeRequest?.requestId &&
    candidate.writeRequest?.persistenceEpoch ===
      input.writeRequest?.persistenceEpoch;
}

function useCloudBaselineStore() {
  const [baseline, setBaseline] = useState<CloudBaselineState>(
    createDetachedCloudBaseline
  );
  const baselineRef = useRef<CloudBaselineState>(baseline);
  const transition = useCallback(
    (reduce: (current: CloudBaselineState) => CloudBaselineState) => {
      const next = reduce(baselineRef.current);
      baselineRef.current = next;
      setBaseline(next);
      return next;
    },
    []
  );
  return { baseline, baselineRef, transition };
}

function useCurrentBaselineIdentity(
  designId: string | null,
  revision: string | null,
  documentEpochRef: MutableRefObject<number>
) {
  return useCallback(
    (): CloudBaselineIdentity | null =>
      designId && revision
        ? { designId, revision, epoch: documentEpochRef.current }
        : null,
    [designId, documentEpochRef, revision]
  );
}

function useBeginBaselineLoad(
  transition: BaselineStore["transition"]
) {
  return useCallback(
    (target: { designId: string; requestEpoch: number }) => {
      transition((state) => beginCloudBaselineLoad(state, target));
    },
    [transition]
  );
}

function useInstallLoadedBaseline(
  transition: BaselineStore["transition"],
  documentEpochRef: MutableRefObject<number>
) {
  return useCallback(
    (loaded: {
      designId: string;
      revision: string;
      requestEpoch: number;
      fingerprint: string;
    }) => {
      const nextEpoch = documentEpochRef.current + 1;
      const identity = {
        designId: loaded.designId,
        revision: loaded.revision,
        epoch: nextEpoch,
      };
      const next = transition((state) =>
        installPendingCloudBaseline(state, {
          requestEpoch: loaded.requestEpoch,
          identity,
          fingerprint: loaded.fingerprint,
          requireFingerprintMatch: true,
          writeRequest: null,
        })
      );
      if (!pendingBaselineMatches(next, {
        identity,
        fingerprint: loaded.fingerprint,
        requireFingerprintMatch: true,
        writeRequest: null,
      })) return null;
      documentEpochRef.current = nextEpoch;
      return identity;
    },
    [documentEpochRef, transition]
  );
}

function useCancelBaselineLoad(transition: BaselineStore["transition"]) {
  return useCallback(
    (requestEpoch?: number) => {
      transition((state) => cancelCloudBaselineLoad(state, requestEpoch));
    },
    [transition]
  );
}

function useFailBaselineLoad(
  transition: BaselineStore["transition"],
  getCurrentIdentity: () => CloudBaselineIdentity | null
) {
  return useCallback(
    (failure: {
      designId: string;
      requestEpoch: number;
      reason: "load_failed" | "normalization_failed";
    }) => {
      transition((state) =>
        failCloudBaselineLoad(state, {
          ...failure,
          currentIdentity: getCurrentIdentity(),
        })
      );
    },
    [getCurrentIdentity, transition]
  );
}

function useStageCloudWrite(
  transition: BaselineStore["transition"],
  documentEpochRef: MutableRefObject<number>
) {
  return useCallback(
    (write: {
      designId: string;
      revision: string;
      fingerprint: string;
      epoch: number;
      requestId: number;
      persistenceEpoch: number;
    }) => {
      if (write.epoch !== documentEpochRef.current) return false;
      const identity = {
        designId: write.designId,
        revision: write.revision,
        epoch: write.epoch,
      };
      const next = transition((state) =>
        stagePendingCloudWriteBaseline(state, {
          identity,
          fingerprint: write.fingerprint,
          writeRequest: {
            requestId: write.requestId,
            persistenceEpoch: write.persistenceEpoch,
          },
        })
      );
      return pendingBaselineMatches(next, {
        identity,
        fingerprint: write.fingerprint,
        requireFingerprintMatch: false,
        writeRequest: {
          requestId: write.requestId,
          persistenceEpoch: write.persistenceEpoch,
        },
        includeLoadingPrevious: true,
      });
    },
    [documentEpochRef, transition]
  );
}

function useDetachCloudBaseline(
  transition: BaselineStore["transition"],
  documentEpochRef: MutableRefObject<number>
) {
  return useCallback(() => {
    documentEpochRef.current += 1;
    transition(() => createDetachedCloudBaseline());
  }, [documentEpochRef, transition]);
}

function useCurrentWriteBlocked(
  designId: string | null,
  baselineRef: BaselineStore["baselineRef"],
  getCurrentIdentity: () => CloudBaselineIdentity | null
) {
  return useCallback(
    () => isCloudWriteBlocked(
      baselineRef.current,
      getCurrentIdentity(),
      Boolean(designId)
    ),
    [baselineRef, designId, getCurrentIdentity]
  );
}

function useAcknowledgePendingBaseline(input: {
  store: BaselineStore;
  currentFingerprint: string;
  getCurrentIdentity: () => CloudBaselineIdentity | null;
  acknowledgeFingerprint: (fingerprint: string) => void;
  finishSaving: (writeRequest: DesignPageCloudWriteRequestIdentity | null) => void;
}) {
  const { store, currentFingerprint, getCurrentIdentity } = input;
  useEffect(() => {
    const identity = getCurrentIdentity();
    if (!identity || store.baseline.status !== "pending") return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const acknowledged = acknowledgePendingCloudBaseline(
        store.baselineRef.current,
        { identity, currentFingerprint }
      );
      if (acknowledged.status !== "acknowledged") return;
      store.transition(() => acknowledged);
      input.acknowledgeFingerprint(acknowledged.fingerprint);
      input.finishSaving(acknowledged.writeRequest);
    });
    return () => {
      active = false;
    };
  }, [currentFingerprint, getCurrentIdentity, input, store]);
}

export function useDesignPageCloudBaselineController(
  input: BaselineControllerInput
) {
  const store = useCloudBaselineStore();
  const getCurrentIdentity = useCurrentBaselineIdentity(
    input.designId,
    input.revision,
    input.documentEpochRef
  );
  const beginLoad = useBeginBaselineLoad(store.transition);
  const installLoaded = useInstallLoadedBaseline(
    store.transition,
    input.documentEpochRef
  );
  const cancelLoad = useCancelBaselineLoad(store.transition);
  const failLoad = useFailBaselineLoad(store.transition, getCurrentIdentity);
  const stageWrite = useStageCloudWrite(
    store.transition,
    input.documentEpochRef
  );
  const detach = useDetachCloudBaseline(
    store.transition,
    input.documentEpochRef
  );
  const currentWriteIsBlocked = useCurrentWriteBlocked(
    input.designId,
    store.baselineRef,
    getCurrentIdentity
  );
  useAcknowledgePendingBaseline({
    store,
    currentFingerprint: input.currentFingerprint,
    getCurrentIdentity,
    acknowledgeFingerprint: input.acknowledgeFingerprint,
    finishSaving: input.finishSaving,
  });
  return {
    state: { baseline: store.baseline },
    actions: {
      beginLoad,
      installLoaded,
      cancelLoad,
      failLoad,
      stageWrite,
      detach,
      getCurrentIdentity,
      currentWriteIsBlocked,
    },
  };
}

export type DesignPageCloudBaselineController = ReturnType<
  typeof useDesignPageCloudBaselineController
>;
