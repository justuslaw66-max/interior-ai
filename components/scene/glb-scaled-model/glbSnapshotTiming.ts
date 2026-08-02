export type GLBRequiredSnapshotTransportTiming = {
  schedulingDelayMs: number;
  computationDurationMs: number;
  serializationDurationMs: number;
  transferDurationMs: number;
};

export function calculateGLBRequiredSnapshotTransportTiming({
  hostRequestStartedAtUnixMs,
  callbackEnteredAtUnixMs,
  computationStartedAtUnixMs,
  computationCompletedAtUnixMs,
  serializationCompletedAtUnixMs,
  hostResultReceivedAtUnixMs,
}: {
  hostRequestStartedAtUnixMs: number;
  callbackEnteredAtUnixMs: number;
  computationStartedAtUnixMs: number;
  computationCompletedAtUnixMs: number;
  serializationCompletedAtUnixMs: number;
  hostResultReceivedAtUnixMs: number;
}): GLBRequiredSnapshotTransportTiming {
  return {
    schedulingDelayMs: Math.max(
      0,
      callbackEnteredAtUnixMs - hostRequestStartedAtUnixMs
    ),
    computationDurationMs: Math.max(
      0,
      computationCompletedAtUnixMs - computationStartedAtUnixMs
    ),
    serializationDurationMs: Math.max(
      0,
      serializationCompletedAtUnixMs - computationCompletedAtUnixMs
    ),
    transferDurationMs: Math.max(
      0,
      hostResultReceivedAtUnixMs - serializationCompletedAtUnixMs
    ),
  };
}
