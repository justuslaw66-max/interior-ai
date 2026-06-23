import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { bytesToMiB, resolveImportQaLimits } from "@/lib/importQaPolicy";
import { getRejectedLiveGateAssets, type LiveGateReasonCode } from "@/lib/live-catalog";
import { computePaywallPerformanceSummary } from "@/lib/paywall-performance";
import { computeRevenueFunnelMetrics } from "@/lib/revenue-funnel";
import { CATALOG_ITEMS } from "@/lib/catalog";
import { buildCatalogCommerceReadiness } from "@/lib/catalog-commerce-readiness";
import { resolveCheckoutBoundaryDiagnostics } from "@/lib/beta-checkout-boundary";
import { buildBetaFeedbackTriage } from "@/lib/beta-feedback-triage";
import { buildBetaLaunchReadinessSummary } from "@/lib/beta-launch-readiness";
import PaywallPerformancePanel from "@/components/admin/PaywallPerformancePanel";
import RevenueFunnelPanel from "@/components/admin/RevenueFunnelPanel";
import { config } from "@/lib/config";
import { redirect } from "next/navigation";
import Link from "next/link";

type WebhookFailureEvent = {
  id: string;
  eventType: string;
  meta: unknown;
  createdAt: Date;
};

type BetaFeedbackEvent = {
  id: string;
  designId: string | null;
  shareToken: string | null;
  meta: Record<string, unknown> | null;
  createdAt: Date;
};

type PaywallEvent = {
  id: string;
  eventType: string;
  meta: Record<string, unknown> | null;
  createdAt: Date;
};

function daysAgo(n: number) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getString(value: unknown, fallback = "Unknown") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function getNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function buildPaywallPerformanceCsv(params: {
  generatedAt: Date;
  reviewWindowDays: number;
  winnerSummary: string;
  rows: Array<{
    variant: string;
    upgradeClicks: number;
    checkoutStarts: number;
    clickToCheckoutRate: string;
    primaryClicks: number;
    secondaryClicks: number;
    monthlySelections: number;
    yearlySelections: number;
    annualHighlightSelections: number;
  }>;
}) {
  const csvRows = [
    ["generated_at", params.generatedAt.toISOString()],
    ["review_window_days", String(params.reviewWindowDays)],
    ["winner_summary", params.winnerSummary],
    [],
    [
      "variant",
      "upgrade_clicks",
      "checkout_starts",
      "click_to_checkout_rate",
      "primary_clicks",
      "secondary_clicks",
      "monthly_selections",
      "yearly_selections",
      "annual_highlight_selections",
    ],
    ...params.rows.map((row) => [
      row.variant,
      String(row.upgradeClicks),
      String(row.checkoutStarts),
      row.clickToCheckoutRate,
      String(row.primaryClicks),
      String(row.secondaryClicks),
      String(row.monthlySelections),
      String(row.yearlySelections),
      String(row.annualHighlightSelections),
    ]),
  ];

  return csvRows
    .map((row) => row.map((cell) => {
      const escaped = cell.replace(/"/g, '""');
      return `"${escaped}"`;
    }).join(","))
    .join("\n");
}

function buildBetaFeedbackCsv(params: {
  generatedAt: Date;
  rows: BetaFeedbackEvent[];
}) {
  const csvRows = [
    ["generated_at", params.generatedAt.toISOString()],
    [],
    [
      "created_at",
      "design_id",
      "share_token",
      "page",
      "note",
      "active_room",
      "mode",
      "view_mode",
      "placement_kind",
      "placement_score",
      "shopping_needs_review",
      "save_status",
      "share_enabled",
      "viewport",
      "severity",
      "route",
      "triage_label",
    ],
    ...params.rows.map((event) => {
      const meta = getRecord(event.meta);
      const context = getRecord(meta.context);
      const triage = buildBetaFeedbackTriage(event.meta);
      const viewportWidth = getNumber(context.viewportWidth);
      const viewportHeight = getNumber(context.viewportHeight);

      return [
        event.createdAt.toISOString(),
        event.designId ?? "",
        event.shareToken ?? "",
        getString(meta.page, ""),
        getString(meta.note, ""),
        getString(context.activeRoomName, ""),
        getString(context.mode, ""),
        getString(context.viewMode, ""),
        getString(context.placementKind, ""),
        String(getNumber(context.placementScore) ?? ""),
        String(getNumber(context.shoppingNeedsReviewCount) ?? ""),
        getString(context.saveStatus, ""),
        String(Boolean(context.shareEnabled)),
        viewportWidth && viewportHeight ? `${viewportWidth}x${viewportHeight}` : "",
        triage.severity,
        triage.route,
        triage.label,
      ];
    }),
  ];

  return csvRows
    .map((row) =>
      row
        .map((cell) => {
          const escaped = cell.replace(/"/g, '""');
          return `"${escaped}"`;
        })
        .join(",")
    )
    .join("\n");
}

function buildBetaLaunchReadinessCsv(params: {
  generatedAt: Date;
  summary: ReturnType<typeof buildBetaLaunchReadinessSummary>;
}) {
  const rows = [
    ["generated_at", params.generatedAt.toISOString()],
    ["status", params.summary.status],
    ["label", params.summary.label],
    ["checkout_safe", String(params.summary.signals.checkoutSafe)],
    ["critical_feedback_count", String(params.summary.signals.criticalFeedbackCount)],
    ["high_feedback_count", String(params.summary.signals.highFeedbackCount)],
    ["catalog_commerce_issue_count", String(params.summary.signals.catalogCommerceIssueCount)],
    ["share_created_24h", String(params.summary.signals.shareCreated24h)],
    ["export_opened_24h", String(params.summary.signals.exportOpened24h)],
    [],
    ["blockers"],
    ...params.summary.blockers.map((blocker) => [blocker]),
    [],
    ["warnings"],
    ...params.summary.warnings.map((warning) => [warning]),
  ];

  return rows
    .map((row) =>
      row
        .map((cell) => {
          const escaped = cell.replace(/"/g, '""');
          return `"${escaped}"`;
        })
        .join(",")
    )
    .join("\n");
}

const LIVE_GATE_REASON_LABELS: Record<LiveGateReasonCode, string> = {
  NOT_APPROVED: "Asset status is not approved",
  INVALID_AABB: "Invalid AABB bounds",
  MISSING_MODEL_URL: "Missing model URL",
  MISSING_THUMB_URL: "Missing thumbnail URL",
  INVALID_DIMS: "Invalid dimensions",
  MISSING_CATALOG_ITEM: "No catalog item linked",
  MISSING_BRAND_FINISHES: "No raw supplier finishes",
  MISSING_FINISH_MAPPINGS: "Finish mapping incomplete",
};

export default async function AdminOverviewPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const devBypass =
    config.isDev &&
    (resolvedSearchParams?.devBypass === "1" ||
      (Array.isArray(resolvedSearchParams?.devBypass) && resolvedSearchParams?.devBypass.includes("1")));

  if (!devBypass && (!session?.user?.email || !isAdminEmail(session.user.email))) {
    redirect("/");
  }

  const since24h = daysAgo(1);
  const since7d = daysAgo(7);
  const appEventClient = (prisma as unknown as {
    appEvent: {
      count: (args: { where: { eventType: string; createdAt: { gte: Date } } }) => Promise<number>;
      findMany: (args: {
        where: { eventType: string; createdAt: { gte: Date } };
        orderBy: { createdAt: "desc" | "asc" };
        take: number;
        select?: Record<string, boolean>;
      }) => Promise<WebhookFailureEvent[] | BetaFeedbackEvent[]>;
    };
  }).appEvent;

  const [
    designs24h,
    designs7d,
    landingViewed7d,
    designStarted7d,
    firstItemAdded7d,
    thirdItemAdded7d,
    exportClicked7d,
    upgradeClicked7d,
    checkoutStarted7d,
    checkoutCompleted7d,
    shareCreated24h,
    shareOpened24h,
    designDuplicated24h,
    shareDesignDuplicated24h,
    exportOpened24h,
    exportPrinted24h,
    checkoutStarted24h,
    affiliateClicks24h,
    webhookFailed24h,
    recentDesigns,
    recentOrders,
    recentWebhookFails,
    recentBetaFeedback,
    paywallEvents7d,
    liveGateRejected,
  ] = await Promise.all([
    prisma.design.count({ where: { createdAt: { gte: since24h } } }),
    prisma.design.count({ where: { createdAt: { gte: since7d } } }),
    appEventClient.count({
      where: { eventType: "landing_viewed", createdAt: { gte: since7d } },
    }),
    appEventClient.count({
      where: { eventType: "design_started", createdAt: { gte: since7d } },
    }),
    appEventClient.count({
      where: { eventType: "first_item_added", createdAt: { gte: since7d } },
    }),
    appEventClient.count({
      where: { eventType: "third_item_added", createdAt: { gte: since7d } },
    }),
    appEventClient.count({
      where: { eventType: "export_clicked", createdAt: { gte: since7d } },
    }),
    appEventClient.count({
      where: { eventType: "upgrade_clicked", createdAt: { gte: since7d } },
    }),
    appEventClient.count({
      where: { eventType: "checkout_started", createdAt: { gte: since7d } },
    }),
    appEventClient.count({
      where: { eventType: "checkout_completed", createdAt: { gte: since7d } },
    }),
    appEventClient.count({
      where: { eventType: "share_link_created", createdAt: { gte: since24h } },
    }),
    appEventClient.count({
      where: { eventType: "share_link_opened", createdAt: { gte: since24h } },
    }),
    appEventClient.count({
      where: { eventType: "design_duplicated", createdAt: { gte: since24h } },
    }),
    appEventClient.count({
      where: { eventType: "share_design_duplicated", createdAt: { gte: since24h } },
    }),
    appEventClient.count({
      where: { eventType: "export_opened", createdAt: { gte: since24h } },
    }),
    appEventClient.count({
      where: { eventType: "export_printed", createdAt: { gte: since24h } },
    }),
    appEventClient.count({
      where: { eventType: "checkout_started", createdAt: { gte: since24h } },
    }),
    prisma.productClick.count({ where: { createdAt: { gte: since24h } } }),
    appEventClient.count({
      where: { eventType: "webhook_failed", createdAt: { gte: since24h } },
    }),
    prisma.design.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { user: { select: { email: true } } },
    }),
    prisma.shopifyOrder.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    appEventClient.findMany({
      where: { eventType: "webhook_failed", createdAt: { gte: since24h } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }) as Promise<WebhookFailureEvent[]>,
    appEventClient.findMany({
      where: { eventType: "beta_feedback_submitted", createdAt: { gte: since7d } },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        designId: true,
        shareToken: true,
        meta: true,
        createdAt: true,
      },
    }) as Promise<BetaFeedbackEvent[]>,
    prisma.appEvent.findMany({
      where: {
        eventType: { in: ["upgrade_clicked", "checkout_started"] },
        createdAt: { gte: since7d },
      },
      orderBy: { createdAt: "desc" },
      take: 2000,
      select: {
        id: true,
        eventType: true,
        meta: true,
        createdAt: true,
      },
    }) as Promise<PaywallEvent[]>,
    getRejectedLiveGateAssets(),
  ]);

  const funnelMetrics = computeRevenueFunnelMetrics({
    landingViewed: landingViewed7d,
    designStarted: designStarted7d,
    firstItemAdded: firstItemAdded7d,
    thirdItemAdded: thirdItemAdded7d,
    exportClicked: exportClicked7d,
    upgradeClicked: upgradeClicked7d,
    checkoutStarted: checkoutStarted7d,
    checkoutCompleted: checkoutCompleted7d,
  });
  const paywallPerformance = computePaywallPerformanceSummary(paywallEvents7d);
  const paywallCsvGeneratedAt = new Date();
  const paywallCsv = buildPaywallPerformanceCsv({
    generatedAt: paywallCsvGeneratedAt,
    reviewWindowDays: paywallPerformance.reviewWindowDays,
    winnerSummary: paywallPerformance.winnerSummary,
    rows: paywallPerformance.rows,
  });
  const paywallCsvHref = `data:text/csv;charset=utf-8,${encodeURIComponent(paywallCsv)}`;

  const sentryUrl =
    process.env.SENTRY_ISSUES_URL || process.env.SENTRY_PROJECT_URL || "";
  const importQaLimits = resolveImportQaLimits();
  const importQaReportDir = process.env.IMPORT_QA_REPORT_DIR || "reports/import-qa";
  const finishGateEnabled = process.env.LIVE_GATE_REQUIRE_FINISH_MAPPING === "true";
  const catalogCommerceReadiness = buildCatalogCommerceReadiness(Object.values(CATALOG_ITEMS));
  const checkoutBoundaryDiagnostics = resolveCheckoutBoundaryDiagnostics();
  const betaFeedbackTriages = recentBetaFeedback.map((event) => buildBetaFeedbackTriage(event.meta));
  const betaLaunchReadiness = buildBetaLaunchReadinessSummary({
    checkout: checkoutBoundaryDiagnostics,
    catalog: catalogCommerceReadiness,
    feedback: betaFeedbackTriages,
    shareCreated24h,
    exportOpened24h,
  });
  const betaFeedbackCsvGeneratedAt = new Date();
  const betaFeedbackCsvHref = `data:text/csv;charset=utf-8,${encodeURIComponent(
    buildBetaFeedbackCsv({
      generatedAt: betaFeedbackCsvGeneratedAt,
      rows: recentBetaFeedback,
    })
  )}`;
  const betaLaunchReadinessCsvHref = `data:text/csv;charset=utf-8,${encodeURIComponent(
    buildBetaLaunchReadinessCsv({
      generatedAt: betaFeedbackCsvGeneratedAt,
      summary: betaLaunchReadiness,
    })
  )}`;

  return (
    <div className="p-6 space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Admin Overview</h1>
        <p className="text-sm text-neutral-600">Last updated: {new Date().toLocaleString()}</p>
        <div className="mt-2">
          <Link href="/admin/catalog/inbox" className="mr-3 text-xs text-blue-600 hover:text-blue-700">
            Open catalog workflow inbox
          </Link>
          <Link href="/admin/catalog/review" className="mr-3 text-xs text-blue-600 hover:text-blue-700">
            Open side-by-side review queue
          </Link>
          <Link href="/admin/catalog/health" className="mr-3 text-xs text-blue-600 hover:text-blue-700">
            Open catalog health
          </Link>
          <Link href="/admin/imports" className="mr-3 text-xs text-blue-600 hover:text-blue-700">
            Open import jobs
          </Link>
          <Link href="/admin/finishes" className="text-xs text-blue-600 hover:text-blue-700">
            Open finish mapper
          </Link>
          <Link href="/admin/audit" className="ml-3 text-xs text-blue-600 hover:text-blue-700">
            Open audit board
          </Link>
          <Link href="/admin/catalog/governance" className="ml-3 text-xs text-blue-600 hover:text-blue-700">
            Open governance
          </Link>
        </div>
      </header>

      <section className="rounded-xl border p-4" data-testid="beta-launch-readiness">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Beta Launch Readiness</h2>
            <p className="mt-1 text-xs text-neutral-600">
              Combined launch signal from checkout boundary, catalog commerce, feedback triage, share, and export activity.
            </p>
            <a
              data-testid="beta-launch-readiness-csv"
              href={betaLaunchReadinessCsvHref}
              download="beta-launch-readiness.csv"
              className="mt-2 inline-block text-xs font-semibold text-blue-600 hover:text-blue-700"
            >
              Download readiness CSV
            </a>
          </div>
          <div
            data-testid="beta-launch-readiness-status"
            className={
              betaLaunchReadiness.status === "ready"
                ? "rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"
                : betaLaunchReadiness.status === "review"
                  ? "rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700"
                  : "rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700"
            }
          >
            {betaLaunchReadiness.label}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
          <div className="rounded-lg border p-3">
            <div className="text-xs text-neutral-500">Checkout</div>
            <div className="text-sm font-semibold">{betaLaunchReadiness.signals.checkoutSafe ? "Safe" : "Blocked"}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-neutral-500">Critical feedback</div>
            <div className="text-sm font-semibold">{betaLaunchReadiness.signals.criticalFeedbackCount}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-neutral-500">High feedback</div>
            <div className="text-sm font-semibold">{betaLaunchReadiness.signals.highFeedbackCount}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-neutral-500">Catalog issues</div>
            <div className="text-sm font-semibold">{betaLaunchReadiness.signals.catalogCommerceIssueCount}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-neutral-500">Share/export 24h</div>
            <div className="text-sm font-semibold">
              {betaLaunchReadiness.signals.shareCreated24h}/{betaLaunchReadiness.signals.exportOpened24h}
            </div>
          </div>
        </div>
        {betaLaunchReadiness.blockers.length > 0 ? (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            <div className="font-semibold">Blockers</div>
            <ul className="mt-1 list-disc pl-4">
              {betaLaunchReadiness.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {betaLaunchReadiness.warnings.length > 0 ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <div className="font-semibold">Warnings</div>
            <ul className="mt-1 list-disc pl-4">
              {betaLaunchReadiness.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border p-4">
          <div className="text-sm text-neutral-500">Designs created (24h)</div>
          <div className="text-2xl font-semibold">{designs24h}</div>
          <div className="text-xs text-neutral-500">7d: {designs7d}</div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-sm text-neutral-500">Share links (24h)</div>
          <div className="text-2xl font-semibold">{shareCreated24h}</div>
          <div className="text-xs text-neutral-500">Opened: {shareOpened24h}</div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-sm text-neutral-500">Design duplicates (24h)</div>
          <div className="text-2xl font-semibold">{designDuplicated24h + shareDesignDuplicated24h}</div>
          <div className="text-xs text-neutral-500">From share: {shareDesignDuplicated24h}</div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-sm text-neutral-500">Exports (24h)</div>
          <div className="text-2xl font-semibold">{exportOpened24h}</div>
          <div className="text-xs text-neutral-500">Printed: {exportPrinted24h}</div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-sm text-neutral-500">Checkout started (24h)</div>
          <div className="text-2xl font-semibold">{checkoutStarted24h}</div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-sm text-neutral-500">Affiliate clicks (24h)</div>
          <div className="text-2xl font-semibold">{affiliateClicks24h}</div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-sm text-neutral-500">Webhook failures (24h)</div>
          <div className="text-2xl font-semibold">{webhookFailed24h}</div>
          {sentryUrl ? (
            <a
              className="text-xs text-blue-600 hover:text-blue-700"
              href={sentryUrl}
              target="_blank"
              rel="noreferrer"
            >
              View Sentry errors
            </a>
          ) : (
            <div className="text-xs text-neutral-500">SENTRY_ISSUES_URL not set</div>
          )}
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-sm text-neutral-500">Beta feedback (7d)</div>
          <div className="text-2xl font-semibold">{recentBetaFeedback.length}</div>
          <div className="text-xs text-neutral-500">Latest triage reports</div>
        </div>
      </section>

      <section className="rounded-xl border p-4" data-testid="beta-feedback-triage">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Beta Feedback Triage</h2>
            <p className="mt-1 text-xs text-neutral-600">
              Recent reports include editor mode, room, placement, shopping, save, share, and viewport context.
            </p>
          </div>
          <div className="text-right">
            <a
              data-testid="beta-feedback-triage-csv"
              href={betaFeedbackCsvHref}
              download="beta-feedback-triage.csv"
              className="text-xs font-semibold text-blue-600 hover:text-blue-700"
            >
              Download CSV
            </a>
            <div className="mt-1 text-xs text-neutral-500">{recentBetaFeedback.length} in 7d</div>
          </div>
        </div>
        <div className="mt-3 space-y-3">
          {recentBetaFeedback.map((event) => {
            const meta = getRecord(event.meta);
            const context = getRecord(meta.context);
            const note = getString(meta.note, "No note");
            const page = getString(meta.page, "Unknown page");
            const activeRoomName = getString(context.activeRoomName, "Unknown room");
            const modeLabel = `${getString(context.mode, "mode")} / ${getString(context.viewMode, "view")}`;
            const placementScore = getNumber(context.placementScore);
            const placementKind = getString(context.placementKind, "none");
            const shoppingNeedsReview = getNumber(context.shoppingNeedsReviewCount);
            const saveStatus = getString(context.saveStatus, "unknown");
            const shareEnabled = Boolean(context.shareEnabled);
            const triage = buildBetaFeedbackTriage(event.meta);
            const triageClass =
              triage.severity === "critical"
                ? "bg-red-50 text-red-700 border-red-200"
                : triage.severity === "high"
                  ? "bg-amber-50 text-amber-700 border-amber-200"
                  : triage.severity === "medium"
                    ? "bg-blue-50 text-blue-700 border-blue-200"
                    : "bg-neutral-50 text-neutral-600 border-neutral-200";

            return (
              <div key={event.id} className="rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium text-neutral-950">{note}</div>
                      <span
                        data-testid="beta-feedback-triage-severity"
                        className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${triageClass}`}
                      >
                        {triage.severity} · {triage.label}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-neutral-500">
                      {page} · {event.createdAt.toLocaleString()} · {triage.route}
                    </div>
                    <div className="mt-1 text-xs text-neutral-500">{triage.detail}</div>
                  </div>
                  <div className="text-right text-xs text-neutral-500">
                    <div>{event.designId ?? "No design"}</div>
                    <div>{event.shareToken ? "Share linked" : "No share"}</div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
                  <div className="rounded border bg-neutral-50 p-2">
                    <div className="text-neutral-500">Room</div>
                    <div className="font-semibold">{activeRoomName}</div>
                  </div>
                  <div className="rounded border bg-neutral-50 p-2">
                    <div className="text-neutral-500">Mode</div>
                    <div className="font-semibold">{modeLabel}</div>
                  </div>
                  <div className="rounded border bg-neutral-50 p-2">
                    <div className="text-neutral-500">Placement</div>
                    <div className="font-semibold">
                      {placementScore === null ? placementKind : `${placementKind} ${placementScore}`}
                    </div>
                  </div>
                  <div className="rounded border bg-neutral-50 p-2">
                    <div className="text-neutral-500">State</div>
                    <div className="font-semibold">
                      {saveStatus} · {shareEnabled ? "shared" : "not shared"} · {shoppingNeedsReview ?? 0} review
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {recentBetaFeedback.length === 0 && (
            <div className="text-xs text-neutral-500">No beta feedback submitted in the last 7 days.</div>
          )}
        </div>
      </section>

      <RevenueFunnelPanel
        landingViewed={landingViewed7d}
        designStarted={designStarted7d}
        firstItemAdded={firstItemAdded7d}
        thirdItemAdded={thirdItemAdded7d}
        exportClicked={exportClicked7d}
        upgradeClicked={upgradeClicked7d}
        checkoutStarted={checkoutStarted7d}
        checkoutCompleted={checkoutCompleted7d}
        metrics={funnelMetrics}
      />

      <PaywallPerformancePanel
        summary={paywallPerformance}
        csvHref={paywallCsvHref}
        generatedAtLabel={paywallCsvGeneratedAt.toLocaleString()}
      />

      <section className="rounded-xl border p-4" data-testid="checkout-boundary-diagnostics">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Checkout Boundary</h2>
            <p className="mt-1 text-xs text-neutral-600">
              Secret-safe diagnostics for staging and production checkout configuration.
            </p>
          </div>
          <div
            data-testid="checkout-boundary-status"
            className={
              checkoutBoundaryDiagnostics.checkoutSafe
                ? "rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"
                : "rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700"
            }
          >
            {checkoutBoundaryDiagnostics.checkoutSafe ? "Safe" : "Blocked"}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-lg border p-3">
            <div className="text-xs text-neutral-500">App stage</div>
            <div className="text-sm font-semibold">{checkoutBoundaryDiagnostics.appStage}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-neutral-500">Stripe secret</div>
            <div className="text-sm font-semibold">{checkoutBoundaryDiagnostics.stripeSecretMode}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-neutral-500">Stripe publishable</div>
            <div className="text-sm font-semibold">{checkoutBoundaryDiagnostics.stripePublishableMode}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-neutral-500">Database</div>
            <div className="text-sm font-semibold">{checkoutBoundaryDiagnostics.databaseBoundary}</div>
          </div>
        </div>
        {checkoutBoundaryDiagnostics.hardStops.length > 0 ? (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            <div className="font-semibold">Hard stops</div>
            <ul className="mt-1 list-disc pl-4">
              {checkoutBoundaryDiagnostics.hardStops.map((stop) => (
                <li key={stop}>{stop}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {checkoutBoundaryDiagnostics.warnings.length > 0 ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <div className="font-semibold">Warnings</div>
            <ul className="mt-1 list-disc pl-4">
              {checkoutBoundaryDiagnostics.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border p-4" data-testid="catalog-commerce-readiness-dashboard">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Catalog Commerce Readiness</h2>
            <p className="mt-1 text-xs text-neutral-600">
              Products need valid price and commerce metadata before checkout, retailer handoff, or replacement suggestions.
            </p>
          </div>
          <Link href="/admin/catalog/health" className="text-xs text-blue-600 hover:text-blue-700">
            Open catalog health
          </Link>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-lg border p-3">
            <div className="text-xs text-neutral-500">Products</div>
            <div className="text-xl font-semibold">{catalogCommerceReadiness.totalProducts}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-neutral-500">Checkout eligible</div>
            <div className="text-xl font-semibold">{catalogCommerceReadiness.checkoutEligibleCount}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-neutral-500">Retailer eligible</div>
            <div className="text-xl font-semibold">{catalogCommerceReadiness.retailerEligibleCount}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-neutral-500">Replacement eligible</div>
            <div className="text-xl font-semibold">{catalogCommerceReadiness.replacementEligibleCount}</div>
          </div>
        </div>
        {catalogCommerceReadiness.issues.length === 0 ? (
          <div className="mt-3 text-xs text-green-700">All catalog products have beta-ready commerce metadata.</div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-160 border-collapse text-xs">
              <thead>
                <tr className="border-b bg-neutral-50 text-left">
                  <th className="px-2 py-2 font-medium">Product</th>
                  <th className="px-2 py-2 font-medium">Issue</th>
                  <th className="px-2 py-2 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody>
                {catalogCommerceReadiness.issues.slice(0, 20).map((issue) => (
                  <tr key={`${issue.productId}-${issue.kind}`} className="border-b align-top">
                    <td className="px-2 py-2 font-medium">{issue.title}</td>
                    <td className="px-2 py-2">{issue.kind}</td>
                    <td className="px-2 py-2 text-neutral-600">{issue.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {catalogCommerceReadiness.issues.length > 20 ? (
              <div className="mt-2 text-xs text-neutral-500">
                Showing first 20 of {catalogCommerceReadiness.issues.length} commerce issues.
              </div>
            ) : null}
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border p-4">
          <h2 className="text-lg font-semibold">Recent Designs</h2>
          <div className="mt-3 space-y-2 text-sm">
            {recentDesigns.map((design: (typeof recentDesigns)[number]) => (
              <div key={design.id} className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{design.title}</div>
                  <div className="text-xs text-neutral-500">{design.user?.email ?? "Anonymous"}</div>
                </div>
                <div className="text-xs text-neutral-500">{design.createdAt.toLocaleString()}</div>
              </div>
            ))}
            {recentDesigns.length === 0 && (
              <div className="text-xs text-neutral-500">No designs yet.</div>
            )}
          </div>
        </div>

        <div className="rounded-xl border p-4">
          <h2 className="text-lg font-semibold">Recent Orders (Shopify)</h2>
          <div className="mt-3 space-y-2 text-sm">
            {recentOrders.map((order: (typeof recentOrders)[number]) => (
              <div key={order.id} className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{order.orderRef}</div>
                  <div className="text-xs text-neutral-500">{order.currency ?? ""} {order.total ?? ""}</div>
                </div>
                <div className="text-xs text-neutral-500">{order.createdAt.toLocaleString()}</div>
              </div>
            ))}
            {recentOrders.length === 0 && (
              <div className="text-xs text-neutral-500">No orders stored yet.</div>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-xl border p-4">
        <h2 className="text-lg font-semibold">Importer QA Policy</h2>
        <p className="mt-1 text-xs text-neutral-600">
          Active server policy loaded from importer env vars. Read-only view for ops verification.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-lg border p-3">
            <div className="text-xs text-neutral-500">Max file size</div>
            <div className="text-sm font-medium">{bytesToMiB(importQaLimits.maxFileSizeBytes).toFixed(2)} MB</div>
            <div className="text-[11px] text-neutral-500">`IMPORT_QA_MAX_FILE_SIZE_MB`</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-neutral-500">Max triangles</div>
            <div className="text-sm font-medium">{importQaLimits.maxTriangles.toLocaleString()}</div>
            <div className="text-[11px] text-neutral-500">`IMPORT_QA_MAX_TRIANGLES`</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-neutral-500">Max texture count</div>
            <div className="text-sm font-medium">{importQaLimits.maxTextureCount}</div>
            <div className="text-[11px] text-neutral-500">`IMPORT_QA_MAX_TEXTURE_COUNT`</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-neutral-500">Max texture resolution</div>
            <div className="text-sm font-medium">{importQaLimits.maxTextureResolution}px</div>
            <div className="text-[11px] text-neutral-500">`IMPORT_QA_MAX_TEXTURE_RESOLUTION`</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-neutral-500">Min AABB axis</div>
            <div className="text-sm font-medium">{importQaLimits.minAabbAxisMeters}m</div>
            <div className="text-[11px] text-neutral-500">`IMPORT_QA_MIN_AABB_AXIS_M`</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-neutral-500">Max AABB axis</div>
            <div className="text-sm font-medium">{importQaLimits.maxAabbAxisMeters}m</div>
            <div className="text-[11px] text-neutral-500">`IMPORT_QA_MAX_AABB_AXIS_M`</div>
          </div>
        </div>
        <div className="mt-3 rounded-lg border p-3">
          <div className="text-xs text-neutral-500">QA report directory</div>
          <div className="text-sm font-medium">{importQaReportDir}</div>
          <div className="text-[11px] text-neutral-500">`IMPORT_QA_REPORT_DIR`</div>
        </div>
      </section>

      <section className="rounded-xl border p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Live Gate Rejection Reasons</h2>
          <div className="text-right text-xs text-neutral-600">
            <div>Non-live assets: {liveGateRejected.length}</div>
            <div className="text-[11px]">
              Finish mapping gate: {finishGateEnabled ? "enabled" : "disabled"}
            </div>
          </div>
        </div>
        <p className="mt-1 text-xs text-neutral-600">
          Assets listed here are blocked from the live catalog until all rejection reasons are resolved.
        </p>

        {liveGateRejected.length === 0 ? (
          <div className="mt-3 text-xs text-green-700">No live-gate rejections. All assets are currently eligible.</div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-160 border-collapse text-xs">
              <thead>
                <tr className="border-b bg-neutral-50 text-left">
                  <th className="px-2 py-2 font-medium">Asset</th>
                  <th className="px-2 py-2 font-medium">Reasons</th>
                  <th className="px-2 py-2 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {liveGateRejected.slice(0, 30).map((entry: (typeof liveGateRejected)[number]) => (
                  <tr key={entry.id} className="border-b align-top">
                    <td className="px-2 py-2 font-medium">{entry.id}</td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-1">
                        {entry.reasons.map((reason: LiveGateReasonCode) => (
                          <span
                            key={`${entry.id}-${reason}`}
                            className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-900"
                            title={reason}
                          >
                            {LIVE_GATE_REASON_LABELS[reason] ?? reason}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-neutral-600">{entry.updatedAt.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border p-4">
        <h2 className="text-lg font-semibold">Recent Webhook Failures (24h)</h2>
        <div className="mt-3 space-y-2 text-sm">
          {recentWebhookFails.map((event: WebhookFailureEvent) => (
            <div key={event.id} className="flex items-center justify-between">
              <div>
                <div className="font-medium">{event.eventType}</div>
                <div className="text-xs text-neutral-500">
                  {(event.meta as { provider?: string } | null)?.provider ?? "unknown"}
                </div>
              </div>
              <div className="text-xs text-neutral-500">{event.createdAt.toLocaleString()}</div>
            </div>
          ))}
          {recentWebhookFails.length === 0 && (
            <div className="text-xs text-neutral-500">No webhook failures in last 24h.</div>
          )}
        </div>
      </section>
    </div>
  );
}
