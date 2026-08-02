import type { RevenueFunnelMetrics } from "@/lib/revenue-funnel";

type RevenueFunnelPanelProps = {
  landingViewed: number;
  designStarted: number;
  firstItemAdded: number;
  thirdItemAdded: number;
  exportClicked: number;
  upgradeClicked: number;
  checkoutStarted: number;
  checkoutCompleted: number;
  metrics: RevenueFunnelMetrics;
};

export default function RevenueFunnelPanel({
  landingViewed,
  designStarted,
  firstItemAdded,
  thirdItemAdded,
  exportClicked,
  upgradeClicked,
  checkoutStarted,
  checkoutCompleted,
  metrics,
}: RevenueFunnelPanelProps) {
  return (
    <section className="rounded-xl border p-4">
      <h2 className="text-lg font-semibold">Revenue Funnel (7d)</h2>
      <p className="mt-1 text-xs text-neutral-600">
        Conversion health from landing to checkout completion.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-4">
        <div className="rounded-lg border p-3">
          <div className="text-xs text-neutral-500">Landing viewed</div>
          <div className="text-lg font-semibold">{landingViewed}</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-xs text-neutral-500">Design started</div>
          <div className="text-lg font-semibold">{designStarted}</div>
          <div className="text-[11px] text-neutral-500">Start rate: {metrics.startRate}</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-xs text-neutral-500">First item added</div>
          <div className="text-lg font-semibold">{firstItemAdded}</div>
          <div className="text-[11px] text-neutral-500">Placement rate: {metrics.firstPlacementRate}</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-xs text-neutral-500">Third item added</div>
          <div className="text-lg font-semibold">{thirdItemAdded}</div>
          <div className="text-[11px] text-neutral-500">Depth rate: {metrics.thirdPlacementRate}</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-xs text-neutral-500">Export clicked</div>
          <div className="text-lg font-semibold">{exportClicked}</div>
          <div className="text-[11px] text-neutral-500">Intent rate: {metrics.exportIntentRate}</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-xs text-neutral-500">Upgrade clicked</div>
          <div className="text-lg font-semibold">{upgradeClicked}</div>
          <div className="text-[11px] text-neutral-500">Paywall CTR: {metrics.paywallCtr}</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-xs text-neutral-500">Checkout started</div>
          <div className="text-lg font-semibold">{checkoutStarted}</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-xs text-neutral-500">Checkout completed</div>
          <div className="text-lg font-semibold">{checkoutCompleted}</div>
          <div className="text-[11px] text-neutral-500">Conversion: {metrics.purchaseConversion}</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          Dropoff before first placement: {metrics.prePlacementDropoff}
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          Dropoff before export intent: {metrics.preExportDropoff}
        </div>
      </div>
    </section>
  );
}