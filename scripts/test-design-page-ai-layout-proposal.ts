import assert from "node:assert/strict";
import {
  buildPendingAiLayoutProposal,
  collectAiLayoutValidationSummary,
  mergeAiLayoutFitRisk,
} from "../lib/design-page-ai-layout-proposal";
import type { ConstraintResult } from "../lib/constraints/evaluate";
import type { LayoutPlan } from "../lib/design-page-types";
import type { DesignItem } from "../lib/room-types";

const duplicatedWarning: ConstraintResult = {
  id: "warn-1",
  level: "warn",
  message: "Coffee table clearance is tight",
};

const validationSummary = collectAiLayoutValidationSummary([
  [
    { id: "ok-1", level: "ok", message: "OK" },
    duplicatedWarning,
  ],
  [
    duplicatedWarning,
    { id: "error-1", level: "error", message: "Sofa is outside room bounds" },
  ],
]);

assert.deepEqual(validationSummary.warnings, [
  "Coffee table clearance is tight",
  "Sofa is outside room bounds",
]);
assert.equal(validationSummary.validationRisk, "high");

assert.equal(mergeAiLayoutFitRisk("low", "medium"), "medium");
assert.equal(mergeAiLayoutFitRisk("high", "medium"), "high");
assert.equal(mergeAiLayoutFitRisk("low", "high"), "high");

const plan: LayoutPlan = {
  quality: {
    completeness: 80,
    fitRisk: "low",
    requiredMissing: [],
    warnings: ["AI warning"],
  },
  meta: {
    style: "Modern",
    budget: "$$",
    seed: 42,
  },
};

const items: DesignItem[] = [
  {
    instanceId: "item-1",
    productId: "known-sofa",
    variantId: "default",
    position: [0, 0, 0],
  },
  {
    instanceId: "item-2",
    productId: "missing-title",
    variantId: "default",
    position: [1, 0, 1],
  },
];

const proposal = buildPendingAiLayoutProposal({
  plan,
  items,
  appliedRugRule: true,
  sourceLabel: "AI starter",
  style: "Scandi",
  budget: "$",
  validationWarnings: validationSummary.warnings,
  validationRisk: validationSummary.validationRisk,
  itemNameByProductId: (productId) =>
    productId === "known-sofa" ? "Known Sofa" : undefined,
  nowMs: 123,
});

assert.equal(proposal.id, "ai-layout-123-42");
assert.equal(proposal.fitRisk, "high");
assert.equal(proposal.completeness, 80);
assert.equal(proposal.sourceLabel, "AI starter");
assert.equal(proposal.style, "Modern");
assert.equal(proposal.budget, "$$");
assert.equal(proposal.seed, 42);
assert.equal(proposal.appliedRugRule, true);
assert.deepEqual(proposal.itemNames, ["Known Sofa", "missing-title"]);
assert.deepEqual(proposal.warnings, [
  "AI warning",
  "Coffee table clearance is tight",
  "Sofa is outside room bounds",
]);

console.log("Design page AI layout proposal checks passed");
