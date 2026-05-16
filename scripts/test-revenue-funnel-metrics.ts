import assert from "node:assert/strict";
import { computeRevenueFunnelMetrics } from "../lib/revenue-funnel";

function main() {
  const baseline = computeRevenueFunnelMetrics({
    landingViewed: 200,
    designStarted: 120,
    firstItemAdded: 90,
    thirdItemAdded: 60,
    exportClicked: 30,
    upgradeClicked: 12,
    checkoutStarted: 8,
    checkoutCompleted: 3,
  });

  assert.equal(baseline.startRate, "60.0%");
  assert.equal(baseline.firstPlacementRate, "75.0%");
  assert.equal(baseline.thirdPlacementRate, "50.0%");
  assert.equal(baseline.exportIntentRate, "25.0%");
  assert.equal(baseline.paywallCtr, "40.0%");
  assert.equal(baseline.purchaseConversion, "37.5%");
  assert.equal(baseline.prePlacementDropoff, 30);
  assert.equal(baseline.preExportDropoff, 60);

  const zeroDenominator = computeRevenueFunnelMetrics({
    landingViewed: 0,
    designStarted: 0,
    firstItemAdded: 0,
    thirdItemAdded: 0,
    exportClicked: 0,
    upgradeClicked: 0,
    checkoutStarted: 0,
    checkoutCompleted: 0,
  });

  assert.equal(zeroDenominator.startRate, "0.0%");
  assert.equal(zeroDenominator.purchaseConversion, "0.0%");
  assert.equal(zeroDenominator.prePlacementDropoff, 0);
  assert.equal(zeroDenominator.preExportDropoff, 0);

  console.log("Revenue funnel metric assertions passed.");
}

main();