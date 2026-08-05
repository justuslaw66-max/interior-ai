export type CloudBaselineIdentity = {
  designId: string;
  revision: string;
  epoch: number;
};

type DetachedCloudBaseline = { status: "detached" };

type PendingCloudBaseline = {
  status: "pending";
  identity: CloudBaselineIdentity;
  fingerprint: string;
  requireFingerprintMatch: boolean;
};

type AcknowledgedCloudBaseline = {
  status: "acknowledged";
  identity: CloudBaselineIdentity;
  fingerprint: string;
};

type RestorableCloudBaseline =
  | DetachedCloudBaseline
  | PendingCloudBaseline
  | AcknowledgedCloudBaseline;

type LoadingCloudBaseline = {
  status: "loading";
  designId: string;
  requestEpoch: number;
  previous: RestorableCloudBaseline;
};

type FailedCloudBaseline = {
  status: "failed";
  designId: string;
  requestEpoch: number;
  reason: "load_failed" | "normalization_failed";
};

export type CloudBaselineState =
  | RestorableCloudBaseline
  | LoadingCloudBaseline
  | FailedCloudBaseline;

function identitiesMatch(
  left: CloudBaselineIdentity,
  right: CloudBaselineIdentity
): boolean {
  return left.designId === right.designId &&
    left.revision === right.revision &&
    left.epoch === right.epoch;
}

export function createDetachedCloudBaseline(): DetachedCloudBaseline {
  return { status: "detached" };
}

export function beginCloudBaselineLoad(
  state: CloudBaselineState,
  target: { designId: string; requestEpoch: number }
): CloudBaselineState {
  const previous = state.status === "loading"
    ? state.previous
    : state.status === "failed"
      ? createDetachedCloudBaseline()
      : state;
  return { status: "loading", ...target, previous };
}

export function installPendingCloudBaseline(
  state: CloudBaselineState,
  input: {
    requestEpoch: number;
    identity: CloudBaselineIdentity;
    fingerprint: string;
    requireFingerprintMatch: boolean;
  }
): CloudBaselineState {
  if (
    state.status !== "loading" ||
    state.designId !== input.identity.designId ||
    state.requestEpoch !== input.requestEpoch
  ) {
    return state;
  }
  return {
    status: "pending",
    identity: input.identity,
    fingerprint: input.fingerprint,
    requireFingerprintMatch: input.requireFingerprintMatch,
  };
}

export function cancelCloudBaselineLoad(
  state: CloudBaselineState,
  requestEpoch?: number
): CloudBaselineState {
  if (
    state.status !== "loading" ||
    (requestEpoch !== undefined && state.requestEpoch !== requestEpoch)
  ) {
    return state;
  }
  return state.previous;
}

export function createPendingCloudWriteBaseline(input: {
  identity: CloudBaselineIdentity;
  fingerprint: string;
}): PendingCloudBaseline {
  return {
    status: "pending",
    identity: input.identity,
    fingerprint: input.fingerprint,
    requireFingerprintMatch: false,
  };
}

function sharesCloudDocumentGeneration(
  left: CloudBaselineIdentity,
  right: CloudBaselineIdentity
): boolean {
  return left.designId === right.designId && left.epoch === right.epoch;
}

export function stagePendingCloudWriteBaseline(
  state: CloudBaselineState,
  input: { identity: CloudBaselineIdentity; fingerprint: string }
): CloudBaselineState {
  const pending = createPendingCloudWriteBaseline(input);
  if (state.status === "loading") {
    if (
      state.previous.status === "detached" ||
      !sharesCloudDocumentGeneration(state.previous.identity, input.identity)
    ) {
      return state;
    }
    return { ...state, previous: pending };
  }
  if (state.status === "failed") return state;
  if (state.status === "detached") return pending;
  return sharesCloudDocumentGeneration(state.identity, input.identity)
    ? pending
    : state;
}

export function acknowledgePendingCloudBaseline(
  state: CloudBaselineState,
  current: {
    identity: CloudBaselineIdentity;
    currentFingerprint: string;
  }
): CloudBaselineState {
  if (state.status !== "pending") return state;
  if (!identitiesMatch(state.identity, current.identity)) return state;
  if (
    state.requireFingerprintMatch &&
    state.fingerprint !== current.currentFingerprint
  ) {
    return state;
  }
  return {
    status: "acknowledged",
    identity: state.identity,
    fingerprint: state.fingerprint,
  };
}

export function failCloudBaselineLoad(
  state: CloudBaselineState,
  input: {
    designId: string;
    requestEpoch: number;
    reason: FailedCloudBaseline["reason"];
    currentIdentity: CloudBaselineIdentity | null;
  }
): CloudBaselineState {
  if (
    state.status !== "loading" ||
    state.designId !== input.designId ||
    state.requestEpoch !== input.requestEpoch
  ) {
    return state;
  }
  if (
    input.currentIdentity &&
    state.previous.status !== "detached" &&
    sharesCloudDocumentGeneration(
      state.previous.identity,
      input.currentIdentity
    )
  ) {
    return state.previous;
  }
  return {
    status: "failed",
    designId: input.designId,
    requestEpoch: input.requestEpoch,
    reason: input.reason,
  };
}

export function isCloudAutosaveBlocked(
  state: CloudBaselineState,
  currentIdentity: CloudBaselineIdentity | null
): boolean {
  if (!currentIdentity) return false;
  return state.status !== "acknowledged" ||
    !identitiesMatch(state.identity, currentIdentity);
}

export function isCloudWriteBlocked(
  state: CloudBaselineState,
  currentIdentity: CloudBaselineIdentity | null,
  hasCloudDesign: boolean
): boolean {
  if (!hasCloudDesign) return state.status !== "detached";
  return !currentIdentity || isCloudAutosaveBlocked(state, currentIdentity);
}
