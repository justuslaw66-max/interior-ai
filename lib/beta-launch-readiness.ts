import type { CheckoutBoundaryDiagnostics } from "@/lib/beta-checkout-boundary";
import type { CatalogCommerceReadinessSummary } from "@/lib/catalog-commerce-readiness";
import type { BetaFeedbackTriage } from "@/lib/beta-feedback-triage";

export type BetaLaunchReadinessStatus = "ready" | "review" | "blocked";

export type BetaLaunchReadinessSummary = {
  status: BetaLaunchReadinessStatus;
  label: string;
  blockers: string[];
  warnings: string[];
  signals: {
    criticalFeedbackCount: number;
    highFeedbackCount: number;
    catalogCommerceIssueCount: number;
    checkoutSafe: boolean;
    shareCreated24h: number;
    exportOpened24h: number;
  };
};

export function buildBetaLaunchReadinessSummary(input: {
  checkout: CheckoutBoundaryDiagnostics;
  catalog: CatalogCommerceReadinessSummary;
  feedback: BetaFeedbackTriage[];
  shareCreated24h: number;
  exportOpened24h: number;
}): BetaLaunchReadinessSummary {
  const criticalFeedbackCount = input.feedback.filter(
    (entry) => entry.severity === "critical"
  ).length;
  const highFeedbackCount = input.feedback.filter((entry) => entry.severity === "high").length;
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!input.checkout.checkoutSafe) {
    blockers.push("Checkout boundary is blocked.");
  }
  if (criticalFeedbackCount > 0) {
    blockers.push(`${criticalFeedbackCount} critical beta feedback report${criticalFeedbackCount === 1 ? "" : "s"}.`);
  }
  if (input.catalog.replacementEligibleCount === 0) {
    blockers.push("No catalog products are replacement eligible.");
  }

  if (input.catalog.replacementIneligibleCount > 0) {
    warnings.push(`${input.catalog.replacementIneligibleCount} catalog product${input.catalog.replacementIneligibleCount === 1 ? "" : "s"} need commerce readiness review.`);
  }
  if (highFeedbackCount > 0) {
    warnings.push(`${highFeedbackCount} high-priority beta feedback report${highFeedbackCount === 1 ? "" : "s"}.`);
  }
  if (input.shareCreated24h === 0) {
    warnings.push("No share links created in the last 24 hours.");
  }
  if (input.exportOpened24h === 0) {
    warnings.push("No export packs opened in the last 24 hours.");
  }

  const status: BetaLaunchReadinessStatus =
    blockers.length > 0 ? "blocked" : warnings.length > 0 ? "review" : "ready";

  return {
    status,
    label:
      status === "ready"
        ? "Ready"
        : status === "review"
          ? "Review"
          : "Blocked",
    blockers,
    warnings,
    signals: {
      criticalFeedbackCount,
      highFeedbackCount,
      catalogCommerceIssueCount: input.catalog.issues.length,
      checkoutSafe: input.checkout.checkoutSafe,
      shareCreated24h: input.shareCreated24h,
      exportOpened24h: input.exportOpened24h,
    },
  };
}
