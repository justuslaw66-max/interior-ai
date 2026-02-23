import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { redirect } from "next/navigation";
import type { Design, User, ShopifyOrder, AppEvent } from "@prisma/client";

function daysAgo(n: number) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

export default async function AdminOverviewPage() {
  const session = await auth();
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    redirect("/");
  }

  const since24h = daysAgo(1);
  const since7d = daysAgo(7);

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
  ] = await Promise.all([
    prisma.design.count({ where: { createdAt: { gte: since24h } } }),
    prisma.design.count({ where: { createdAt: { gte: since7d } } }),
    prisma.appEvent.count({
      where: { eventType: "share_link_created", createdAt: { gte: since24h } },
    }),
    prisma.appEvent.count({
      where: { eventType: "share_link_opened", createdAt: { gte: since24h } },
    }),
    prisma.appEvent.count({
      where: { eventType: "export_opened", createdAt: { gte: since24h } },
    }),
    prisma.appEvent.count({
      where: { eventType: "export_printed", createdAt: { gte: since24h } },
    }),
    prisma.appEvent.count({
      where: { eventType: "checkout_started", createdAt: { gte: since24h } },
    }),
    prisma.productClick.count({ where: { createdAt: { gte: since24h } } }),
    prisma.appEvent.count({
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
    prisma.appEvent.findMany({
      where: { eventType: "webhook_failed", createdAt: { gte: since24h } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const sentryUrl =
    process.env.SENTRY_ISSUES_URL || process.env.SENTRY_PROJECT_URL || "";

  return (
    <div className="p-6 space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Admin Overview</h1>
        <p className="text-sm text-neutral-600">Last updated: {new Date().toLocaleString()}</p>
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
        <h2 className="text-lg font-semibold">Recent Webhook Failures (24h)</h2>
        <div className="mt-3 space-y-2 text-sm">
          {recentWebhookFails.map((event: AppEvent) => (
            <div key={event.id} className="flex items-center justify-between">
              <div>
                <div className="font-medium">{event.eventType}</div>
                <div className="text-xs text-neutral-500">
                  {(event.meta as any)?.provider ?? "unknown"}
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
