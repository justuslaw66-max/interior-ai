import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { bytesToMiB, resolveImportQaLimits } from "@/lib/importQaPolicy";
import { getRejectedLiveGateAssets, type LiveGateReasonCode } from "@/lib/live-catalog";
import { computePaywallPerformanceSummary } from "@/lib/paywall-performance";
import { computeRevenueFunnelMetrics } from "@/lib/revenue-funnel";
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

type PaywallEvent = {
  id: string;
  eventType: string;
  meta: Record<string, unknown> | null;
  createdAt: Date;
};

function daysAgo(n: number) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
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
      }) => Promise<WebhookFailureEvent[]>;
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
    }),
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
            <table className="w-full min-w-[640px] border-collapse text-xs">
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
