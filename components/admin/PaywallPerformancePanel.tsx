import type { PaywallPerformanceSummary } from "@/lib/paywall-performance";

export default function PaywallPerformancePanel({
  summary,
  csvHref,
  generatedAtLabel,
}: {
  summary: PaywallPerformanceSummary;
  csvHref: string;
  generatedAtLabel: string;
}) {
  const miniChartMaxClicks = Math.max(1, ...summary.rows.map((row) => row.upgradeClicks));

  return (
    <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="rounded-xl border p-4">
        <h2 className="text-lg font-semibold">Paywall Variant Performance (7d)</h2>
        <p className="mt-1 text-xs text-neutral-600">
          Compare upgrade CTA variants using upgrade clicks and checkout starts.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-lg border bg-neutral-50 px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-neutral-500">Upgrade clicks</div>
            <div className="text-lg font-semibold text-neutral-900">{summary.totalUpgradeClicks}</div>
          </div>
          <div className="rounded-lg border bg-neutral-50 px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-neutral-500">Checkout starts</div>
            <div className="text-lg font-semibold text-neutral-900">{summary.totalCheckoutStarts}</div>
          </div>
          <div className="rounded-lg border bg-neutral-50 px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-neutral-500">Review status</div>
            <div className={`text-sm font-semibold ${summary.isDecisionReady ? "text-emerald-700" : "text-amber-700"}`}>
              {summary.isDecisionReady ? "Decision-ready" : "Collecting data"}
            </div>
          </div>
        </div>
        <div className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
          {summary.decisionStatusLabel}
        </div>
        <div className="mt-2 text-[11px] text-neutral-500">
          Sample floor: {summary.minimumVariantSample}/{summary.sampleTargetPerVariant} clicks per variant over {summary.reviewWindowDays} days
        </div>

        {summary.rows.length === 0 ? (
          <div className="mt-3 text-xs text-neutral-500">No paywall variant data yet.</div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-160 border-collapse text-xs">
              <thead>
                <tr className="border-b bg-neutral-50 text-left">
                  <th className="px-2 py-2 font-medium">Variant</th>
                  <th className="px-2 py-2 font-medium">Upgrade clicks</th>
                  <th className="px-2 py-2 font-medium">Checkout starts</th>
                  <th className="px-2 py-2 font-medium">Click → checkout</th>
                  <th className="px-2 py-2 font-medium">Primary / Secondary</th>
                  <th className="px-2 py-2 font-medium">Monthly / Yearly</th>
                  <th className="px-2 py-2 font-medium">Annual highlight</th>
                </tr>
              </thead>
              <tbody>
                {summary.rows.map((row) => (
                  <tr key={row.variant} className="border-b align-top">
                    <td className="px-2 py-2 font-medium">{row.variant}</td>
                    <td className="px-2 py-2">{row.upgradeClicks}</td>
                    <td className="px-2 py-2">{row.checkoutStarts}</td>
                    <td className="px-2 py-2">{row.clickToCheckoutRate}</td>
                    <td className="px-2 py-2">{row.primaryClicks} / {row.secondaryClicks}</td>
                    <td className="px-2 py-2">{row.monthlySelections} / {row.yearlySelections}</td>
                    <td className="px-2 py-2">{row.annualHighlightSelections}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {summary.rows.length > 0 && (
          <div className="mt-4 space-y-2">
            <div className="text-xs font-medium text-neutral-700">Mini trend chart (upgrade clicks by variant)</div>
            {summary.rows.map((row) => {
              const widthPercent = Math.max(6, Math.round((row.upgradeClicks / miniChartMaxClicks) * 100));
              return (
                <div key={`chart-${row.variant}`} className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-neutral-600">
                    <span>{row.variant}</span>
                    <span>{row.upgradeClicks} clicks</span>
                  </div>
                  <div className="h-2 rounded-full bg-neutral-100">
                    <div
                      className="h-2 rounded-full bg-blue-500"
                      style={{ width: `${widthPercent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-xl border p-4">
        <h2 className="text-lg font-semibold">Weekly Review Loop</h2>
        <p className="mt-1 text-xs text-neutral-600">
          Review every Monday using actual upgrade-click to checkout-start movement.
        </p>

        <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
          {summary.winnerSummary}
        </div>

        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-neutral-700">
          <li>Compare the winning CTA variant against the runner-up on click-to-checkout rate.</li>
          <li>Check whether yearly selections are rising or falling relative to monthly selections.</li>
          <li>Update only one headline or CTA string per week, then watch the next 7-day window.</li>
        </ol>

        <div className="mt-4 space-y-2 text-xs text-neutral-600">
          {summary.reviewNotes.map((note) => (
            <div key={note} className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2">
              {note}
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
          <span>Snapshot generated: {generatedAtLabel}</span>
          <a
            className="font-medium text-blue-600 hover:text-blue-700"
            href={csvHref}
            download="paywall-performance-7d.csv"
          >
            Download CSV
          </a>
        </div>
      </div>
    </section>
  );
}