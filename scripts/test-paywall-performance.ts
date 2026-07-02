import assert from "node:assert/strict";
import { computePaywallPerformanceSummary } from "../lib/paywall-performance";

const summary = computePaywallPerformanceSummary([
  {
    eventType: "upgrade_clicked",
    meta: {
      cta_variant: "unlock_pro_exports",
      cta_position: "primary",
      cta: "see_plans",
    },
  },
  {
    eventType: "upgrade_clicked",
    meta: {
      cta_variant: "unlock_pro_exports",
      cta_position: "plans_primary_left",
      cta: "monthly",
    },
  },
  {
    eventType: "checkout_started",
    meta: {
      cta_variant: "unlock_pro_exports",
      interval: "monthly",
    },
  },
  {
    eventType: "upgrade_clicked",
    meta: {
      cta_variant: "see_pricing",
      cta_position: "primary",
      cta: "see_plans",
    },
  },
  {
    eventType: "upgrade_clicked",
    meta: {
      cta_variant: "see_pricing",
      cta_position: "plans_primary_right",
      cta: "yearly",
      pricing_layout: "annual_highlight",
    },
  },
  {
    eventType: "checkout_started",
    meta: {
      cta_variant: "see_pricing",
      interval: "yearly",
      pricing_layout: "annual_highlight",
    },
  },
  {
    eventType: "checkout_started",
    meta: {
      cta_variant: "see_pricing",
      interval: "yearly",
      pricing_layout: "annual_highlight",
    },
  },
]);

assert.equal(summary.rows.length, 2);
assert.equal(summary.rows[0]?.variant, "see_pricing");
assert.equal(summary.rows[0]?.upgradeClicks, 2);
assert.equal(summary.rows[0]?.checkoutStarts, 2);
assert.equal(summary.rows[0]?.clickToCheckoutRate, "100.0%");
assert.equal(summary.rows[0]?.yearlySelections, 3);
assert.equal(summary.rows[0]?.annualHighlightSelections, 3);
assert.equal(summary.rows[1]?.variant, "unlock_pro_exports");
assert.equal(summary.rows[1]?.upgradeClicks, 2);
assert.equal(summary.rows[1]?.checkoutStarts, 1);
assert.equal(summary.rows[1]?.clickToCheckoutRate, "50.0%");
assert.equal(summary.rows[1]?.annualHighlightSelections, 0);
assert.equal(summary.totalUpgradeClicks, 4);
assert.equal(summary.totalCheckoutStarts, 3);
assert.equal(summary.isDecisionReady, false);
assert.match(summary.decisionStatusLabel, /Still collecting/);
assert.equal(summary.sampleTargetPerVariant, 10);
assert.equal(summary.minimumVariantSample, 2);
assert.equal(summary.reviewWindowDays, 7);
assert.equal(summary.winnerVariant, "see_pricing");
assert.match(summary.winnerSummary, /see_pricing leads with 100.0%/);
assert(summary.reviewNotes.some((note) => note.includes("Pricing-first messaging is currently stronger")));
assert(summary.reviewNotes.some((note) => note.includes("Yearly selections are competitive")));
assert(summary.reviewNotes.some((note) => note.includes("Annual-highlight pricing layout is live")));

console.log("Paywall performance assertions passed.");