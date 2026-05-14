import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { CATALOG_ITEMS } from "@/lib/catalog";
import AdminTestPanel from "@/components/AdminTestPanel";
import RecentClicksTable from "@/components/RecentClicksTable";
import { redirect } from "next/navigation";
import { isAdminEmail } from "@/lib/admin";

const COMMISSION: Record<string, number> = {
  "Castlery Singapore": 0.08,
  Unknown: 0.05,
};

type ProductCountRow = {
  productId: string;
  _count: { productId: number };
};

type RetailerCountRow = {
  retailer: string | null;
  _count: { retailer: number };
};

type DesignClickCountRow = {
  designId: string | null;
  _count: { designId: number };
};

type RecentClickRow = {
  id: string;
  createdAt: Date;
  clickKey: string;
  productId: string;
  retailer: string | null;
  designId: string | null;
};

type RetailerRevenueRow = {
  retailer: string | null;
  _count: { retailer: number };
  _sum: { price: number | null };
};

export default async function AdminClicksPage() {
  const session = await auth();

  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    redirect("/");
  }

  const now = new Date();
  const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

  const [clicks7d, clicks30d, totalClicks] = await Promise.all([
    prisma.productClick.count({ where: { createdAt: { gte: daysAgo(7) } } }),
    prisma.productClick.count({ where: { createdAt: { gte: daysAgo(30) } } }),
    prisma.productClick.count(),
  ]);

  const topProducts = await prisma.productClick.groupBy({
    by: ["productId"],
    _count: { productId: true },
    orderBy: { _count: { productId: "desc" } },
    take: 12,
  });

  const topRetailers = await prisma.productClick.groupBy({
    by: ["retailer"],
    _count: { retailer: true },
    orderBy: { _count: { retailer: "desc" } },
    take: 10,
  });

  const clicksByDesign = await prisma.productClick.groupBy({
    by: ["designId"],
    _count: { designId: true },
    orderBy: { _count: { designId: "desc" } },
    take: 10,
    where: { designId: { not: null } },
  });

  const clicksRaw = await prisma.productClick.findMany({
    where: { designId: { not: null } },
    select: { designId: true },
  });

  const designIds = Array.from(
    new Set(
      [
        ...clicksByDesign.map((d: { designId: string | null }) => d.designId).filter(Boolean),
        ...clicksRaw.map((c: { designId: string | null }) => c.designId).filter(Boolean),
      ].filter(Boolean)
    )
  ) as string[];

  const designs = await prisma.design.findMany({
    where: { id: { in: designIds } },
    select: { id: true, title: true, style: true, budget: true },
  });
  type DesignSummary = {
    id: string;
    title: string | null;
    style: string | null;
    budget: string | null;
  };
  const designMap = new Map<string, DesignSummary>(
    designs.map((d: DesignSummary) => [d.id, d] as const)
  );

  const clicksByStyle: Record<string, number> = {};
  for (const c of clicksRaw) {
    const d = c.designId ? designMap.get(c.designId) : null;
    const style = (d?.style ?? "Unknown").toString();
    clicksByStyle[style] = (clicksByStyle[style] ?? 0) + 1;
  }
  const clicksByStyleList = Object.entries(clicksByStyle).sort(
    (a, b) => b[1] - a[1]
  );

  const [adds, checkouts, purchases] = await Promise.all([
    prisma.conversionEvent.count({ where: { eventType: "add_to_cart" } }),
    prisma.conversionEvent.count({ where: { eventType: "checkout" } }),
    prisma.conversionEvent.count({ where: { eventType: "purchase" } }),
  ]);

  const retailerRows = await prisma.productClick.groupBy({
    by: ["retailer"],
    _count: { retailer: true },
    _sum: { price: true },
    orderBy: { _count: { retailer: "desc" } },
    take: 10,
  });
  const retailerRevenue = (retailerRows as RetailerRevenueRow[]).map((r) => {
    const retailer = r.retailer ?? "Unknown";
    const rate = COMMISSION[retailer] ?? COMMISSION["Unknown"] ?? 0.05;
    const sumPrice = r._sum.price ?? 0;
    const est = sumPrice * rate;
    return { retailer, clicks: r._count.retailer, sumPrice, rate, est };
  });

  const recent = await prisma.productClick.findMany({
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      createdAt: true,
      clickKey: true,
      productId: true,
      retailer: true,
      designId: true,
    },
  });

  return (
    <main className="min-h-screen bg-neutral-100 p-10 text-neutral-900">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Click Analytics</h1>
          <p className="text-sm text-neutral-800">Admin-only page</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            className="inline-flex rounded-lg bg-neutral-900 px-3 py-2 text-sm text-white"
            href="/api/admin/clicks.csv"
          >
            Export CSV
          </a>
          <a
            className="inline-flex rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900"
            href="http://localhost:5555"
            target="_blank"
            rel="noreferrer"
          >
            Prisma Studio
          </a>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl bg-white p-4 shadow">
          <div className="text-sm text-neutral-700">Clicks (7 days)</div>
          <div className="text-3xl font-semibold text-neutral-900">{clicks7d}</div>
        </div>

        <div className="rounded-xl bg-white p-4 shadow">
          <div className="text-sm text-neutral-700">Clicks (30 days)</div>
          <div className="text-3xl font-semibold text-neutral-900">{clicks30d}</div>
        </div>

        <div className="rounded-xl bg-white p-4 shadow">
          <div className="text-sm text-neutral-700">All-time clicks</div>
          <div className="text-3xl font-semibold text-neutral-900">{totalClicks}</div>
        </div>
      </div>

      <section className="mt-8 rounded-xl bg-white p-4 shadow">
        <h2 className="text-lg font-semibold">Retailer breakdown</h2>
        <div className="mt-3 space-y-2">
          {topRetailers.length === 0 ? (
            <div className="text-sm text-neutral-600">No clicks yet.</div>
          ) : (
            (topRetailers as RetailerCountRow[]).map((r) => (
              <div
                key={r.retailer ?? "unknown"}
                className="flex items-center justify-between rounded-lg border px-3 py-2"
              >
                <div className="text-sm">{r.retailer ?? "Unknown"}</div>
                <div className="text-sm font-semibold">{r._count.retailer}</div>
              </div>
            ))
          )}
        </div>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl bg-white p-4 shadow">
          <h2 className="text-lg font-semibold text-neutral-900">Top clicked products</h2>

          <div className="mt-3 space-y-2">
            {topProducts.length === 0 ? (
              <div className="text-sm text-neutral-800">No clicks yet.</div>
            ) : (
              (topProducts as ProductCountRow[]).map((row) => {
                const product = CATALOG_ITEMS[row.productId];
                return (
                  <div
                    key={row.productId}
                    className="flex items-center justify-between rounded-lg border px-3 py-2"
                  >
                    <div>
                      <div className="text-sm font-semibold">
                        {product?.title ?? row.productId}
                      </div>
                      <div className="text-xs text-neutral-500">
                        {product?.category ?? "unknown"} • {product?.commerce.type === 'affiliate' ? product.commerce.data.retailer : product?.commerce.type === 'shopify' ? 'Shopify' : "—"}
                      </div>
                      <div className="text-[11px] font-mono text-neutral-400">
                        {row.productId}
                      </div>
                    </div>

                    <div className="text-sm font-semibold">{row._count.productId}</div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="rounded-xl bg-white p-4 shadow">
          <h2 className="text-lg font-semibold text-neutral-900">Recent clicks</h2>
          <RecentClicksTable
            rows={(recent as RecentClickRow[]).map((r) => ({
              ...r,
              createdAtLabel: r.createdAt.toLocaleString("en-SG", {
                timeZone: "Asia/Singapore",
              }),
            }))}
          />
        </section>
      </div>

      <section className="mt-8 rounded-xl bg-white p-4 shadow">
        <h2 className="text-lg font-semibold">Top designs by clicks</h2>
        <div className="mt-3 space-y-2">
          {clicksByDesign.length === 0 ? (
            <div className="text-sm text-neutral-600">No design clicks yet.</div>
          ) : (
            (clicksByDesign as DesignClickCountRow[]).map((row) => {
              const design = row.designId ? designMap.get(row.designId) : null;
              return (
                <div
                  key={row.designId!}
                  className="flex items-center justify-between rounded-lg border px-3 py-2"
                >
                  <div>
                    <div className="text-sm font-semibold">
                      {design?.title ?? row.designId}
                    </div>
                    <div className="text-xs text-neutral-500">
                      Style: {design?.style ?? "Unknown"} • Budget: {design?.budget ?? "—"}
                    </div>
                    <div className="text-[11px] font-mono text-neutral-400">
                      {row.designId}
                    </div>
                  </div>
                  <div className="text-sm font-semibold">{row._count.designId}</div>
                </div>
              );
            })
          )}
        </div>
      </section>

      <section className="mt-8 rounded-xl bg-white p-4 shadow">
        <h2 className="text-lg font-semibold">Clicks by style</h2>
        <div className="mt-3 space-y-2">
          {clicksByStyleList.length === 0 ? (
            <div className="text-sm text-neutral-600">No style data yet.</div>
          ) : (
            clicksByStyleList.map(([styleName, count]: [string, number]) => (
              <div
                key={styleName}
                className="flex items-center justify-between rounded-lg border px-3 py-2"
              >
                <div className="text-sm">{styleName}</div>
                <div className="text-sm font-semibold">{count}</div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="mt-8 rounded-xl bg-white p-4 shadow">
        <h2 className="text-lg font-semibold">Funnel</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <div className="rounded-lg border p-3">
            <div className="text-xs text-neutral-500">Clicks</div>
            <div className="text-2xl font-semibold">{totalClicks}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-neutral-500">Add to cart</div>
            <div className="text-2xl font-semibold">{adds}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-neutral-500">Checkout</div>
            <div className="text-2xl font-semibold">{checkouts}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-neutral-500">Purchase</div>
            <div className="text-2xl font-semibold">{purchases}</div>
          </div>
        </div>
      </section>

      <section className="mt-8 rounded-xl bg-white p-4 shadow">
        <h2 className="text-lg font-semibold">Estimated revenue by retailer (V1)</h2>
        <p className="mt-1 text-xs text-neutral-500">
          Estimate = sum(clicked item prices) × commission rate assumption.
        </p>

        <div className="mt-3 overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-2 text-left">Retailer</th>
                <th className="px-3 py-2 text-left">Clicks</th>
                <th className="px-3 py-2 text-left">Sum price</th>
                <th className="px-3 py-2 text-left">Rate</th>
                <th className="px-3 py-2 text-left">Est. revenue</th>
              </tr>
            </thead>
            <tbody>
              {retailerRevenue.map((r) => (
                <tr key={r.retailer} className="border-t">
                  <td className="px-3 py-2">{r.retailer}</td>
                  <td className="px-3 py-2">{r.clicks}</td>
                  <td className="px-3 py-2">{r.sumPrice}</td>
                  <td className="px-3 py-2">{Math.round(r.rate * 100)}%</td>
                  <td className="px-3 py-2 font-semibold">{r.est.toFixed(2)}</td>
                </tr>
              ))}
              {retailerRevenue.length === 0 && (
                <tr>
                  <td className="px-3 py-4 text-neutral-600" colSpan={5}>
                    No clicks yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <AdminTestPanel />
    </main>
  );
}
