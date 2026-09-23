export interface DesignPageCloudQaMarkerProps {
  qaHooksEnabled: boolean;
  cloudDesignId: string | null;
  cloudRevision: string | null;
  cloudBaselineStatus:
    | "detached"
    | "loading"
    | "pending"
    | "acknowledged"
    | "failed";
}

export function DesignPageCloudQaMarker({
  qaHooksEnabled,
  cloudDesignId,
  cloudRevision,
  cloudBaselineStatus,
}: DesignPageCloudQaMarkerProps) {
  if (!qaHooksEnabled) return null;
  return (
    <div
      data-testid="qa-editor-cloud-design"
      data-design-id={cloudDesignId ?? ""}
      data-cloud-revision={cloudRevision ?? ""}
      data-cloud-baseline-status={cloudBaselineStatus}
      hidden
    />
  );
}
