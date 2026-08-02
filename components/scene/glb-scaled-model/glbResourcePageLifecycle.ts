export function applyGLBResourcePageHidePolicy({
  persisted,
  clearPrepared,
  clearParsed,
}: {
  persisted: boolean;
  clearPrepared: () => void;
  clearParsed: () => void;
}) {
  if (persisted) return "retained" as const;
  clearPrepared();
  clearParsed();
  return "cleared" as const;
}
