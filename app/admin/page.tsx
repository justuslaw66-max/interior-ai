import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { bytesToMiB, resolveImportQaLimits } from "@/lib/importQaPolicy";
import { getRejectedLiveGateAssets, type LiveGateReasonCode } from "@/lib/live-catalog";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Design, ShopifyOrder } from "@prisma/client";

type WebhookFailureEvent = {
  id: string;
  eventType: string;
  meta: unknown;
  createdAt: Date;
};

function daysAgo(n: number) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
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

export default async function AdminOverviewPage() {
  const session = await auth();
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
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
    shareCreated24h,
    shareOpened24h,
    exportOpened24h,
    exportPrinted24h,
    checkoutStarted24h,
    affiliateClicks24h,
    webhookFailed24h,
    recentDesigns,
    recentOrders,
    recentWebhookFails,
    liveGateRejected,
  ] = await Promise.all([
    prisma.design.count({ where: { createdAt: { gte: since24h } } }),
    prisma.design.count({ where: { createdAt: { gte: since7d } } }),
    appEventClient.count({
      where: { eventType: "share_link_created", createdAt: { gte: since24h } },
    }),
    appEventClient.count({
      where: { eventType: "share_link_opened", createdAt: { gte: since24h } },
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
    getRejectedLiveGateAssets(),
  ]);

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
            Open catalog inbox
          </Link>
          <Link href="/admin/catalog/review" className="mr-3 text-xs text-blue-600 hover:text-blue-700">
            Open review queue
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

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border p-4">
          <h2 className="text-lg font-semibold">Recent Designs</h2>
          <div className="mt-3 space-y-2 text-sm">
            {recentDesigns.map((design: Design & { user: { email: string | null } | null }) => (
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
            {recentOrders.map((order: ShopifyOrder) => (
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
                {liveGateRejected.slice(0, 30).map((entry) => (
                  <tr key={entry.id} className="border-b align-top">
                    <td className="px-2 py-2 font-medium">{entry.id}</td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-1">
                        {entry.reasons.map((reason) => (
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
