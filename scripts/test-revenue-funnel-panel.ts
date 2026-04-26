import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import RevenueFunnelPanel from "../components/admin/RevenueFunnelPanel";
import { computeRevenueFunnelMetrics } from "../lib/revenue-funnel";

function main() {
  const metrics = computeRevenueFunnelMetrics({
    landingViewed: 200,
    designStarted: 120,
    firstItemAdded: 90,
    thirdItemAdded: 60,
    exportClicked: 30,
    upgradeClicked: 12,
    checkoutStarted: 8,
    checkoutCompleted: 3,
  });

  const html = renderToStaticMarkup(
    React.createElement(RevenueFunnelPanel, {
      landingViewed: 200,
      designStarted: 120,
      firstItemAdded: 90,
      thirdItemAdded: 60,
      exportClicked: 30,
      upgradeClicked: 12,
      checkoutStarted: 8,
      checkoutCompleted: 3,
      metrics,
    })
  );

  assert.match(html, /Revenue Funnel \(7d\)/);
  assert.match(html, /Start rate: 60\.0%/);
  assert.match(html, /Placement rate: 75\.0%/);
  assert.match(html, /Depth rate: 50\.0%/);
  assert.match(html, /Intent rate: 25\.0%/);
  assert.match(html, /Paywall CTR: 40\.0%/);
  assert.match(html, /Conversion: 37\.5%/);
  assert.match(html, /Dropoff before first placement: 30/);
  assert.match(html, /Dropoff before export intent: 60/);

  console.log("Revenue funnel panel render assertions passed.");
}

main();