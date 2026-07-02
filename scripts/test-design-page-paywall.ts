import assert from "node:assert/strict";
import {
  buildPaywallContextMeta,
  getPaywallExperimentEnvConfig,
  getPrimaryUpgradeCtaLabel,
  hashStringToVariant,
  normalizeExperimentSlot,
  normalizeUpgradeVariant,
  resolvePaywallVariant,
  resolvePricingLayoutVariant,
} from "../lib/design-page-paywall";

function runFixture(name: string, assertion: () => void) {
  try {
    assertion();
    console.log(`PASS: ${name}`);
  } catch (error) {
    console.error(`FAIL: ${name}`);
    throw error;
  }
}

runFixture("hashStringToVariant is deterministic", () => {
  const seed = "user-123";
  const first = hashStringToVariant(seed);
  const second = hashStringToVariant(seed);
  assert.equal(first, second);
  assert.ok(first === "unlock_pro_exports" || first === "see_pricing");
});

runFixture("normalizers accept only known values", () => {
  assert.equal(normalizeUpgradeVariant("unlock_pro_exports"), "unlock_pro_exports");
  assert.equal(normalizeUpgradeVariant("see_pricing"), "see_pricing");
  assert.equal(normalizeUpgradeVariant("unknown"), null);

  assert.equal(normalizeExperimentSlot("value_stack_v2"), "value_stack_v2");
  assert.equal(normalizeExperimentSlot("control"), "control");
  assert.equal(normalizeExperimentSlot("other"), "control");
});

runFixture("env config parses flags and variants", () => {
  const config = getPaywallExperimentEnvConfig({
    nodeEnv: "production",
    enableQaHooks: "true",
    paywallWinnerDefault: "see_pricing",
    paywallFallbackVariant: "unlock_pro_exports",
    paywallForceFallback: "1",
    paywallExperimentSlot: "value_stack_v2",
  });

  assert.equal(config.qaPaywallHooksEnabled, true);
  assert.equal(config.paywallWinnerDefault, "see_pricing");
  assert.equal(config.paywallFallbackVariant, "unlock_pro_exports");
  assert.equal(config.paywallForceFallback, true);
  assert.equal(config.paywallExperimentSlot, "value_stack_v2");
});

runFixture("resolvePaywallVariant honors override precedence", () => {
  const withExplicitOverride = resolvePaywallVariant({
    qaPaywallHooksEnabled: true,
    paywallVariantOverride: "see_pricing",
    storageVariantOverride: "unlock_pro_exports",
    paywallForceFallback: false,
    paywallFallbackVariant: "unlock_pro_exports",
    paywallWinnerDefault: null,
    seed: "seed-1",
  });
  assert.equal(withExplicitOverride, "see_pricing");

  const withStorageOverride = resolvePaywallVariant({
    qaPaywallHooksEnabled: true,
    paywallVariantOverride: null,
    storageVariantOverride: "see_pricing",
    paywallForceFallback: false,
    paywallFallbackVariant: "unlock_pro_exports",
    paywallWinnerDefault: "unlock_pro_exports",
    seed: "seed-2",
  });
  assert.equal(withStorageOverride, "see_pricing");

  const withFallback = resolvePaywallVariant({
    qaPaywallHooksEnabled: false,
    paywallVariantOverride: "see_pricing",
    storageVariantOverride: "see_pricing",
    paywallForceFallback: true,
    paywallFallbackVariant: "unlock_pro_exports",
    paywallWinnerDefault: "see_pricing",
    seed: "seed-3",
  });
  assert.equal(withFallback, "unlock_pro_exports");

  const withWinner = resolvePaywallVariant({
    qaPaywallHooksEnabled: false,
    paywallVariantOverride: null,
    storageVariantOverride: null,
    paywallForceFallback: false,
    paywallFallbackVariant: "unlock_pro_exports",
    paywallWinnerDefault: "see_pricing",
    seed: "seed-4",
  });
  assert.equal(withWinner, "see_pricing");
});

runFixture("layout and context helpers map expected values", () => {
  assert.equal(resolvePricingLayoutVariant("see_pricing"), "annual_highlight");
  assert.equal(resolvePricingLayoutVariant("unlock_pro_exports"), "default");
  assert.equal(getPrimaryUpgradeCtaLabel("see_pricing"), "See pricing");
  assert.equal(getPrimaryUpgradeCtaLabel("unlock_pro_exports"), "Unlock Pro exports");

  const context = buildPaywallContextMeta({
    ctaVariant: "see_pricing",
    pricingLayout: "annual_highlight",
    experimentSlot: "control",
    forceFallback: false,
  });
  assert.deepEqual(context, {
    cta_variant: "see_pricing",
    pricing_layout: "annual_highlight",
    experiment_slot: "control",
    force_fallback: false,
  });
});

console.log("All paywall helper fixtures passed.");
