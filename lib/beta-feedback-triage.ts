export type BetaFeedbackSeverity = "critical" | "high" | "medium" | "low";
export type BetaFeedbackRoute = "save" | "placement" | "shopping" | "share_export" | "general";

export type BetaFeedbackTriage = {
  severity: BetaFeedbackSeverity;
  route: BetaFeedbackRoute;
  label: string;
  detail: string;
};

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function buildBetaFeedbackTriage(meta: unknown): BetaFeedbackTriage {
  const payload = getRecord(meta);
  const context = getRecord(payload.context);
  const saveStatus = getString(context.saveStatus);
  const placementKind = getString(context.placementKind);
  const placementScore = getNumber(context.placementScore);
  const shoppingNeedsReviewCount = getNumber(context.shoppingNeedsReviewCount) ?? 0;
  const shareEnabled = Boolean(context.shareEnabled);
  const mode = getString(context.mode);

  if (saveStatus === "failed") {
    return {
      severity: "critical",
      route: "save",
      label: "Save failure",
      detail: "User submitted feedback while save status was failed.",
    };
  }

  if (placementKind === "blocks_path") {
    return {
      severity: "critical",
      route: "placement",
      label: "Blocked placement",
      detail: "Placement score reported a blocked walking path.",
    };
  }

  if (placementKind === "cramped" || (placementScore !== null && placementScore < 50)) {
    return {
      severity: "high",
      route: "placement",
      label: "Placement friction",
      detail: "Placement score was cramped or below 50.",
    };
  }

  if (shoppingNeedsReviewCount > 0) {
    return {
      severity: "high",
      route: "shopping",
      label: "Shopping review",
      detail: `${shoppingNeedsReviewCount} item${shoppingNeedsReviewCount === 1 ? "" : "s"} need commerce review.`,
    };
  }

  if (!shareEnabled && (mode === "present" || mode === "export")) {
    return {
      severity: "medium",
      route: "share_export",
      label: "Handoff not shared",
      detail: "User was in handoff mode without an active share link.",
    };
  }

  return {
    severity: "low",
    route: "general",
    label: "General feedback",
    detail: "No blocker signal was detected in captured context.",
  };
}
