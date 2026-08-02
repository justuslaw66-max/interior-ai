import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createPhase15HumanEvidenceTemplate,
  canonicalizePhase15ReleaseManifest,
  PHASE15_HUMAN_EVIDENCE_REQUIREMENTS,
  PHASE15_HUMAN_EVIDENCE_ROW_COUNT,
  PHASE15_MANIFEST_SCHEMA_VERSION,
  productOwnerPublicKeyFingerprint,
  validatePhase15HumanEvidence,
  validatePhase15ReleasePackage,
  type Phase15HumanEvidenceBundle,
  type Phase15ReleaseManifest,
} from "@/lib/phase15-release-evidence";
import {
  EDITOR_PERFORMANCE_METRIC_DEFINITIONS,
  PRODUCT_METRIC_DEFINITIONS,
} from "@/lib/product-metrics";
import {
  PRODUCT_PERFORMANCE_METRICS,
  PRODUCT_TELEMETRY_EVENTS,
  sanitizeProductTelemetryProperties,
  type ProductTelemetryProperties,
} from "@/lib/product-telemetry";
import { sanitizeObservabilityMeta } from "@/lib/observability";

const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");

assert.equal(PRODUCT_TELEMETRY_EVENTS.length, 17);
for (const event of [
  "project_started",
  "room_dimensions_completed",
  "product_placed",
  "project_saved",
  "project_recovered",
  "design_shared",
  "product_purchase_clicked",
] as const) {
  assert.ok(PRODUCT_TELEMETRY_EVENTS.includes(event));
}
assert.equal(EDITOR_PERFORMANCE_METRIC_DEFINITIONS.length, PRODUCT_PERFORMANCE_METRICS.length);
assert.equal(new Set(EDITOR_PERFORMANCE_METRIC_DEFINITIONS.map((entry) => entry.metric)).size, PRODUCT_PERFORMANCE_METRICS.length);
assert.ok(PRODUCT_METRIC_DEFINITIONS.some((entry) => entry.id === "golden_path_completion"));
assert.ok(PRODUCT_METRIC_DEFINITIONS.every((entry) => entry.targetPolicy === "baseline_first" || entry.targetPolicy === "human_evidence"));

const malicious = sanitizeProductTelemetryProperties({
  mode: "consumer",
  source: "catalog",
  resultCount: 3,
  roomType: "12 Main Street #04-02",
  errorCode: "token=secret value",
  address: "private",
  shareToken: "private",
} as ProductTelemetryProperties & Record<string, unknown>);
assert.deepEqual(malicious, { mode: "consumer", source: "catalog", resultCount: 3 });
assert.deepEqual(
  sanitizeObservabilityMeta({
    operation: "save",
    roomName: "Private nursery",
    addressNormalized: "12 Main Street",
    searchQuery: "customer address",
  }),
  {
    operation: "save",
    roomName: "[redacted]",
    addressNormalized: "[redacted]",
    searchQuery: "[redacted]",
  }
);

const instrumentation: Array<[string, string[]]> = [
  ["lib/useDesignPagePaywallTelemetryController.ts", ["project_started"]],
  ["lib/useDesignPageHousePlanState.ts", ["room_created"]],
  ["lib/useDesignPageRoomPlanController.ts", ["room_dimensions_completed"]],
  ["components/catalog/CatalogPanel.tsx", ["catalog_opened", "product_searched", "product_placed"]],
  ["lib/useDesignPageSelectionTransforms.ts", ["object_transformed", "validation_warning_shown"]],
  ["lib/useDesignPageDocumentHistoryController.ts", ["undo_used"]],
  ["components/editor/EditorViewToggle.tsx", ["view_switched_to_3d"]],
  ["lib/useDesignPagePersistence.ts", ["project_saved", "project_save_failed", "design_shared"]],
  ["lib/useDesignPageLocalBackupHydration.ts", ["project_recovered"]],
  ["components/CartSidebar.tsx", ["shopping_list_opened", "product_purchase_clicked"]],
];
for (const [path, events] of instrumentation) {
  const source = readFileSync(join(process.cwd(), path), "utf8");
  for (const event of events) {
    assert.ok(source.includes(`trackProductEvent("${event}"`), `${event} is not instrumented in ${path}`);
  }
}

for (const path of [
  "app/api/ai/layout/route.ts",
  "app/api/designs/route.ts",
  "app/api/designs/[id]/route.ts",
  "app/api/designs/[id]/duplicate/route.ts",
  "app/api/designs/[id]/share/route.ts",
  "app/api/referral/claim/route.ts",
  "app/api/share/[shareToken]/duplicate/route.ts",
  "app/api/shopify/checkout/route.ts",
  "app/api/shopify/confirm/route.ts",
  "app/api/track/click/route.ts",
]) {
  const source = readFileSync(join(process.cwd(), path), "utf8");
  assert.ok(source.includes("trackServerEvent("), `${path} does not use the server analytics adapter`);
  assert.equal(source.includes("getPostHogClient"), false, `${path} imports the analytics vendor boundary`);
}

assert.equal(PHASE15_HUMAN_EVIDENCE_REQUIREMENTS.length, PHASE15_HUMAN_EVIDENCE_ROW_COUNT);
assert.equal(new Set(PHASE15_HUMAN_EVIDENCE_REQUIREMENTS.map((entry) => entry.evidenceId)).size, 48);
const template = createPhase15HumanEvidenceTemplate("2026-07-22T00:00:00.000Z");
assert.equal(template.rows.length, 48);
assert.ok(template.rows.every((row) => row.status === "Blocked"));
const templateValidation = validatePhase15HumanEvidence(template);
assert.equal(templateValidation.structurallyValid, true);
assert.equal(templateValidation.evidenceComplete, false);

const root = mkdtempSync(join(tmpdir(), "phase15-evidence-"));
const artifactContent = "Authorized human review artifact\n";
writeFileSync(join(root, "human-review.txt"), artifactContent);
const artifactSha = sha256(artifactContent);
const commitSha = "a".repeat(40);
const artifactDigest = "b".repeat(64);
const tag = "cabinetry-alpha-rc.1";
const deploymentBuildId = "alpha-build-001";
const httpsEnvironment = "https://alpha.example.test";

const completed = structuredClone(template) as Phase15HumanEvidenceBundle;
completed.candidate = {
  candidateIdentifier: "cabinetry-alpha-rc1",
  commitSha,
  immutableTag: tag,
  buildArtifactDigest: artifactDigest,
  deploymentBuildId,
  httpsEnvironment,
};
for (const row of completed.rows) {
  row.candidateCommitSha = commitSha;
  row.releaseCandidateTag = tag;
  row.artifactDigest = artifactDigest;
  row.deploymentBuildId = deploymentBuildId;
  row.httpsEnvironment = httpsEnvironment;
  row.reviewerIdentifier = "reviewer-001";
  row.reviewerRole = "authorized product reviewer";
  row.reviewTimestamp = "2026-07-22T01:00:00.000Z";
  row.device = "Release test device";
  row.operatingSystem = "Test OS 1";
  row.browserAndVersion = "Test Browser 1";
  row.actualResult = "Observed result matched the expected result for this exact candidate.";
  row.status = "Pass";
  row.evidenceArtifactReference = "human-review.txt";
  row.evidenceArtifactSha256 = artifactSha;
  row.reviewerNotes = "Completed independently against the deployed candidate.";
}

for (const [name, content] of [
  ["package-lock.json", "lock\n"],
  ["automated-report.json", "{}\n"],
  ["playwright.json", "{}\n"],
  ["automated-bundle.tar", "automated\n"],
] as const) {
  writeFileSync(join(root, name), content);
}
const humanEvidenceBytes = Buffer.from(`${JSON.stringify(completed, null, 2)}\n`);
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const manifest: Phase15ReleaseManifest = {
  schemaVersion: PHASE15_MANIFEST_SCHEMA_VERSION,
  candidateIdentifier: "cabinetry-alpha-rc1",
  commitSha,
  immutableTag: tag,
  cleanCheckoutConfirmed: true,
  lockfile: { name: "package-lock", path: "package-lock.json", sha256: sha256("lock\n") },
  automatedReportHashes: [{ name: "automated-report", path: "automated-report.json", sha256: sha256("{}\n") }],
  playwrightJsonReport: { name: "playwright-json", path: "playwright.json", sha256: sha256("{}\n") },
  buildArtifactDigest: artifactDigest,
  deploymentBuildId,
  httpsEnvironment,
  projectSchemaVersion: "3",
  migrationVersion: "38",
  humanEvidenceBundle: { name: "human-evidence", path: "human-evidence.json", sha256: sha256(humanEvidenceBytes) },
  automatedEvidenceBundle: { name: "automated-evidence", path: "automated-bundle.tar", sha256: sha256("automated\n") },
  approvalDecision: "approved",
  approvalTimestamp: "2026-07-22T02:00:00.000Z",
  trustedProductOwnerPublicKeyFingerprint: productOwnerPublicKeyFingerprint(publicKey),
};
writeFileSync(join(root, "human-evidence.json"), humanEvidenceBytes);
const manifestBytes = canonicalizePhase15ReleaseManifest(manifest);
const signature = sign(null, manifestBytes, privateKey);

const valid = validatePhase15ReleasePackage({
  manifest,
  manifestBytes,
  humanEvidence: completed,
  humanEvidenceBytes,
  repositoryRoot: root,
  detachedSignature: signature,
  trustedProductOwnerPublicKey: publicKey,
});
assert.deepEqual(valid.issues, []);
assert.equal(valid.releaseReady, true);

const missingSignature = validatePhase15ReleasePackage({
  manifest,
  manifestBytes,
  humanEvidence: completed,
  humanEvidenceBytes,
  repositoryRoot: root,
  trustedProductOwnerPublicKey: publicKey,
});
assert.equal(missingSignature.releaseReady, false);
assert.ok(missingSignature.issues.some((issue) => issue.level === "approval"));

const mismatched = structuredClone(completed);
mismatched.rows[0].candidateCommitSha = "c".repeat(40);
const mismatchValidation = validatePhase15HumanEvidence(mismatched, {
  repositoryRoot: root,
  manifest,
});
assert.equal(mismatchValidation.evidenceComplete, false);
assert.ok(mismatchValidation.issues.some((issue) => issue.path.endsWith("candidateCommitSha")));

const missingRow = structuredClone(completed);
missingRow.rows.pop();
const missingRowValidation = validatePhase15HumanEvidence(missingRow, {
  repositoryRoot: root,
  manifest,
});
assert.equal(missingRowValidation.evidenceComplete, false);
assert.ok(missingRowValidation.issues.some((issue) => issue.message.includes("missing required evidence row")));

const tamperedManifest = { ...manifest, deploymentBuildId: "different-build" };
const tamperedBytes = Buffer.from(`${JSON.stringify(tamperedManifest, null, 2)}\n`);
const tampered = validatePhase15ReleasePackage({
  manifest: tamperedManifest,
  manifestBytes: tamperedBytes,
  humanEvidence: completed,
  humanEvidenceBytes,
  repositoryRoot: root,
  detachedSignature: signature,
  trustedProductOwnerPublicKey: publicKey,
});
assert.equal(tampered.releaseReady, false);
assert.ok(tampered.issues.some((issue) => issue.path === "signature"));

const nonCanonicalBytes = Buffer.from(JSON.stringify(manifest));
const nonCanonical = validatePhase15ReleasePackage({
  manifest,
  manifestBytes: nonCanonicalBytes,
  humanEvidence: completed,
  humanEvidenceBytes,
  repositoryRoot: root,
  detachedSignature: sign(null, nonCanonicalBytes, privateKey),
  trustedProductOwnerPublicKey: publicKey,
});
assert.equal(nonCanonical.releaseReady, false);
assert.ok(nonCanonical.issues.some((issue) => issue.path === "manifest"));

const privateKeyRejected = validatePhase15ReleasePackage({
  manifest,
  manifestBytes,
  humanEvidence: completed,
  humanEvidenceBytes,
  repositoryRoot: root,
  detachedSignature: signature,
  trustedProductOwnerPublicKey: privateKey,
});
assert.equal(privateKeyRejected.approvalValid, false);
assert.ok(privateKeyRejected.issues.some((issue) => issue.message.includes("public key")));

console.log("Phase 15 telemetry, metric, human-evidence, manifest, and signature checks passed.");
