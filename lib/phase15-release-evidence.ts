import {
  createHash,
  createPublicKey,
  KeyObject,
  verify as verifyEd25519,
} from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";

import { z } from "zod";

export const PHASE15_MANIFEST_SCHEMA_VERSION = "interior_ai.release_manifest.v1" as const;
export const PHASE15_HUMAN_EVIDENCE_SCHEMA_VERSION = "interior_ai.human_evidence.v1" as const;

export type HumanEvidenceRequirement = {
  evidenceId: string;
  category: string;
  requirement: string;
  testSteps: string[];
  expectedResult: string;
};

const requirement = (
  evidenceId: string,
  category: string,
  requirementText: string,
  testSteps: string[],
  expectedResult: string,
): HumanEvidenceRequirement => ({
  evidenceId,
  category,
  requirement: requirementText,
  testSteps,
  expectedResult,
});

export const PHASE15_HUMAN_EVIDENCE_REQUIREMENTS = [
  requirement("P15-H01", "consumer_usability", "A first-time consumer can start a project without developer guidance.", ["Open the HTTPS environment in a clean browser profile.", "Start a new project using the primary consumer entry point."], "The project opens with clear next steps and no Pro-only concepts blocking progress."),
  requirement("P15-H02", "room_setup", "A consumer can select a starter room with understandable dimensions.", ["Open starter layouts.", "Choose a consumer room template.", "Confirm the displayed dimensions."], "The selected room is created at the dimensions shown before confirmation."),
  requirement("P15-H03", "room_setup", "A consumer can create an accurately measured custom room.", ["Choose the measured-room path.", "Enter known width and depth.", "Apply the room."], "The room uses the entered values and clearly displays the active unit."),
  requirement("P15-H04", "room_setup", "Dimension editing and unit switching remain trustworthy.", ["Edit room width and depth.", "Switch between supported units.", "Return to the original unit."], "Converted values remain equivalent and the room geometry stays consistent."),
  requirement("P15-H05", "room_setup", "Doors and windows can be added where the selected plan supports them.", ["Select a supported wall.", "Add a door and a window.", "Review their placement in 2D and 3D."], "Openings remain attached to the intended wall and are visible in both views."),
  requirement("P15-H06", "product_catalog", "Real purchasable products are discoverable from Consumer Mode.", ["Open Furnish.", "Browse recommended and full catalog views.", "Open a real product."], "A real product opens with retailer identity, finish, dimensions, availability, and imagery."),
  requirement("P15-H07", "product_catalog", "Product search returns understandable, relevant results.", ["Search for a known product family.", "Clear the search.", "Search for a category term."], "Results update predictably without exposing internal catalog identifiers."),
  requirement("P15-H08", "product_catalog", "Product details communicate canonical dimensions and the exact selected variant.", ["Open product details.", "Change an available finish or variant.", "Review dimensions and commerce readiness."], "Variant identity, finish, dimensions, imagery, and commerce state stay aligned."),
  requirement("P15-H09", "object_placement", "A consumer can place at least three products.", ["Place three different catalog products.", "Confirm each placement preview."], "All three products appear in the intended room with stable identities."),
  requirement("P15-H10", "object_placement", "Placed objects can be moved using the supported consumer controls.", ["Select a placed object.", "Move it to a valid location.", "Attempt an invalid overlapping move."], "The valid move succeeds and invalid placement is blocked with useful guidance."),
  requirement("P15-H11", "object_placement", "Placed objects can be rotated predictably.", ["Rotate an object with quick controls.", "Enter a precise rotation where supported."], "Rotation is visible in 2D and 3D and respects snapping when enabled."),
  requirement("P15-H12", "object_placement", "Supported object resizing preserves trustworthy scale guidance.", ["Select a resizable object.", "Apply a valid size change.", "Review displayed dimensions."], "The object scale and dimensions update together without corrupting product identity."),
  requirement("P15-H13", "object_placement", "Duplicate and delete actions preserve unrelated objects.", ["Duplicate a selected object.", "Delete the duplicate.", "Verify the original remains."], "The duplicate receives a distinct object identity and deletion affects only the target."),
  requirement("P15-H14", "object_placement", "Snapping, containment, and scale guidance are understandable.", ["Move an object near a supported snap target.", "Move it outside the room boundary.", "Review the guidance."], "Snapping is predictable and invalid containment is explained without losing the object."),
  requirement("P15-H15", "undo_redo", "Undo and redo restore user-visible edits in order.", ["Perform move, rotate, duplicate, and delete actions.", "Undo each action.", "Redo each action."], "The scene, selection, and shopping state follow the visible history sequence."),
  requirement("P15-H16", "save_recovery", "Local save communicates success and persists the visible project.", ["Make a visible edit.", "Use Save.", "Wait for the local save status."], "A clear saved state appears and the stored project contains the edit."),
  requirement("P15-H17", "save_recovery", "Authenticated cloud save communicates success or actionable failure.", ["Sign in to the approved test account.", "Save a project.", "Observe save status and retry behavior."], "Successful saves identify the current project; failures preserve local work and offer recovery."),
  requirement("P15-H18", "save_recovery", "A saved project survives closing and reopening.", ["Save a project containing rooms, openings, and products.", "Close and reopen the project."], "Objects, transforms, variants, rooms, openings, and view state reload without data loss."),
  requirement("P15-H19", "save_recovery", "An invalid local backup presents safe recovery choices.", ["Use the approved invalid-backup fixture.", "Reload the editor.", "Review recovery actions."], "The invalid backup is quarantined and no private project content is uploaded or discarded silently."),
  requirement("P15-H20", "save_recovery", "Last-known-valid recovery restores a usable project.", ["Trigger the approved interrupted-backup fixture.", "Open the last known valid copy."], "The valid copy opens, recovery is acknowledged, and editing can continue."),
  requirement("P15-H21", "view_consistency", "The 2D plan is understandable and usable for supported editing tasks.", ["Switch to 2D.", "Select and transform an object.", "Inspect openings and dimensions."], "The plan remains top-down, scaled, selectable, and consistent with project state."),
  requirement("P15-H22", "view_consistency", "The 3D view is understandable and renders the current scene.", ["Switch to 3D.", "Orbit or navigate using supported controls.", "Select a placed product."], "The scene is navigable and the selected object corresponds to the project state."),
  requirement("P15-H23", "view_consistency", "Repeated 2D/3D switching preserves geometry, selection, and transforms.", ["Select an object in 2D.", "Switch to 3D and back three times."], "No object moves, disappears, changes scale, or loses identity during view switching."),
  requirement("P15-H24", "consumer_mode", "Consumer Mode keeps common workflows simple.", ["Complete room setup, furnishing, saving, and shopping as a consumer."], "The primary path avoids unnecessary construction, release, and professional terminology."),
  requirement("P15-H25", "pro_mode", "Pro Mode exposes advanced capability without a separate incompatible product.", ["Open the same project in Pro Mode.", "Use one advanced control.", "Return to Consumer Mode."], "Advanced controls operate on the same project and consumer-visible state remains intact."),
  requirement("P15-H26", "consumer_pro_continuity", "Consumer and Pro modes preserve the same persisted design contract.", ["Create and save in Consumer Mode.", "Edit and save in Pro Mode.", "Reopen in Consumer Mode."], "Stable IDs, geometry, variants, and shopping state survive the mode changes."),
  requirement("P15-H27", "keyboard_accessibility", "Core project setup and catalog controls are keyboard accessible.", ["Navigate the primary workflow using keyboard only.", "Open and close catalog details."], "All required controls are reachable, operable, and visibly focused."),
  requirement("P15-H28", "keyboard_accessibility", "Object selection, supported transforms, undo, and redo work by keyboard.", ["Select an object without a pointer.", "Use supported transform shortcuts.", "Undo and redo."], "Keyboard actions have visible results and do not trap focus in the canvas."),
  requirement("P15-H29", "screen_reader", "Editor landmarks and workflow controls have understandable accessible names.", ["Navigate the editor with an approved screen reader.", "Review landmarks and workflow buttons."], "Landmarks, modes, save state, and primary actions are announced meaningfully."),
  requirement("P15-H30", "screen_reader", "Validation, save failures, and recovery state are announced.", ["Trigger approved validation and save-error fixtures.", "Review announcements with a screen reader."], "Errors are announced once with useful recovery guidance and are not color-only."),
  requirement("P15-H31", "focus_management", "Dialogs restore focus to the invoking control.", ["Open and close new-plan, placement, and save-conflict dialogs using keyboard."], "Focus enters the dialog, stays within it when appropriate, and returns to the invoker."),
  requirement("P15-H32", "focus_management", "Catalog and shopping panels maintain a logical focus order.", ["Open Furnish and Shop.", "Navigate cards, details, placement, and purchase controls."], "Focus order follows the visual workflow and hidden controls are not focusable."),
  requirement("P15-H33", "touch_mobile", "Supported narrow or touch layouts expose an honest usable workflow.", ["Open the approved narrow viewport or touch device.", "Complete the supported room and catalog tasks."], "Supported tasks remain usable; unsupported precision interactions are clearly disclosed."),
  requirement("P15-H34", "real_device", "The golden path works on an approved physical desktop or laptop.", ["Run the consumer golden path on a physical device and record browser/version."], "The flow completes without device-specific layout, input, or rendering blockers."),
  requirement("P15-H35", "real_device", "The declared mobile or tablet support level is verified on a physical device.", ["Run the documented supported subset on a physical touch device."], "Observed behavior matches the declared support boundary."),
  requirement("P15-H36", "analytics", "Required product events are observed in the approved non-production analytics environment.", ["Run the golden path.", "Inspect the privacy-approved analytics capture."], "All required events appear with non-content-bearing properties and the correct environment identity."),
  requirement("P15-H37", "privacy", "Telemetry excludes private project content and sensitive data.", ["Run telemetry privacy fixtures containing addresses, tokens, custom names, and payment-like fields.", "Inspect captured payloads."], "Sensitive and free-form project data are absent or redacted; editing continues if analytics fails."),
  requirement("P15-H38", "templates", "Starter templates provide credible defaults and an understandable first result.", ["Review each launch-supported starter template.", "Apply representative consumer templates."], "Templates have credible dimensions, materials, openings, and editable results."),
  requirement("P15-H39", "product_catalog", "The release catalog contains trustworthy active product records.", ["Review representative active categories.", "Check identity, dimensions, variants, images, and commerce readiness."], "Active records use canonical units and no draft-only asset is presented as release-ready."),
  requirement("P15-H40", "asset_quality", "Representative 3D assets meet visual, scale, origin, material, and disposal expectations.", ["Load representative assets in the release browser.", "Review scale, pivot, orientation, textures, thumbnails, and repeated open/close behavior."], "Assets appear at trustworthy scale without missing materials, runaway memory, or release-blocking licensing gaps."),
  requirement("P15-H41", "shopping_flow", "The consolidated shopping list reflects the reloaded design.", ["Place mixed commerce products.", "Save and reload.", "Open Shop and auto-fill where offered."], "The list includes the intended current products, variants, quantities, prices, and readiness states."),
  requirement("P15-H42", "shopping_flow", "Supported purchase actions continue to the current destination safely.", ["Use a release-approved checkout or retailer-link fixture.", "Observe destination and failure behavior."], "The correct current variant destination opens and failure does not mutate the design."),
  requirement("P15-H43", "shopping_flow", "Unavailable or discontinued products remain visible in old designs.", ["Open the approved retired-product fixture.", "Review the scene and shopping list."], "The saved visual product remains while shopping clearly reports unavailable commerce."),
  requirement("P15-H44", "fabricator_review", "Custom millwork outputs are reviewed for buildability by an authorized fabricator or qualified professional.", ["Review representative release outputs and assumptions.", "Record defects or approval with artifact hashes."], "The reviewer records an evidence-backed decision; Codex does not self-approve buildability."),
  requirement("P15-H45", "visual_ux", "Consumer visual hierarchy supports the golden path without developer explanation.", ["Complete the consumer golden path while recording hesitation points.", "Review dialogs, empty states, and warnings."], "Primary actions are visually clear and critical warnings are noticeable without overwhelming the flow."),
  requirement("P15-H46", "performance_perception", "Representative small and large projects feel responsive on the declared device class.", ["Load and edit approved small and large fixtures.", "Move objects and switch views while recording perceived delays."], "No unexplained stalls, frozen controls, or unacceptable input lag are observed."),
  requirement("P15-H47", "error_handling", "Network, commerce, asset, and persistence failures preserve user work.", ["Run approved offline, unavailable-product, asset-failure, and save-failure fixtures."], "Each failure is contained, actionable, and does not corrupt the project."),
  requirement("P15-H48", "support_diagnostics", "Support diagnostics identify failures without exposing private project contents.", ["Trigger an approved support-diagnostic capture.", "Inspect identifiers, error codes, and redaction."], "The capture is sufficient to correlate the release, operation, and error while excluding private content and credentials."),
] as const satisfies readonly HumanEvidenceRequirement[];

export const PHASE15_HUMAN_EVIDENCE_ROW_COUNT = 48;

const nonBlank = z.string().trim().min(1);
const nullableNonBlank = nonBlank.nullable();
const sha256 = z.string().regex(/^[0-9a-f]{64}$/i).nullable();
const commitSha = z.string().regex(/^[0-9a-f]{40}$/i).nullable();
const timestamp = z.string().datetime({ offset: true }).nullable();
const httpsUrl = z.string().url().refine((value) => value.startsWith("https://"), "must use HTTPS").nullable();

export const Phase15HumanEvidenceRowSchema = z.object({
  evidenceId: nonBlank,
  requirement: nonBlank,
  candidateCommitSha: commitSha,
  releaseCandidateTag: nullableNonBlank,
  artifactDigest: sha256,
  deploymentBuildId: nullableNonBlank,
  httpsEnvironment: httpsUrl,
  reviewerIdentifier: nullableNonBlank,
  reviewerRole: nullableNonBlank,
  reviewTimestamp: timestamp,
  device: nullableNonBlank,
  operatingSystem: nullableNonBlank,
  browserAndVersion: nullableNonBlank,
  testSteps: z.array(nonBlank).min(1),
  expectedResult: nonBlank,
  actualResult: nonBlank,
  status: z.enum(["Pass", "Fail", "Blocked", "Not applicable"]),
  evidenceArtifactReference: nullableNonBlank,
  evidenceArtifactSha256: sha256,
  defectReference: nullableNonBlank,
  reviewerNotes: nullableNonBlank,
  notApplicableJustification: nullableNonBlank,
}).strict();

export const Phase15HumanEvidenceBundleSchema = z.object({
  schemaVersion: z.literal(PHASE15_HUMAN_EVIDENCE_SCHEMA_VERSION),
  generatedAt: z.string().datetime({ offset: true }),
  candidate: z.object({
    candidateIdentifier: nullableNonBlank,
    commitSha,
    immutableTag: nullableNonBlank,
    buildArtifactDigest: sha256,
    deploymentBuildId: nullableNonBlank,
    httpsEnvironment: httpsUrl,
  }).strict(),
  rows: z.array(Phase15HumanEvidenceRowSchema),
}).strict();

const HashedArtifactSchema = z.object({
  name: nonBlank,
  path: nonBlank,
  sha256: z.string().regex(/^[0-9a-f]{64}$/i),
}).strict();

export const Phase15ReleaseManifestSchema = z.object({
  schemaVersion: z.literal(PHASE15_MANIFEST_SCHEMA_VERSION),
  candidateIdentifier: nonBlank,
  commitSha: z.string().regex(/^[0-9a-f]{40}$/i),
  immutableTag: nonBlank,
  cleanCheckoutConfirmed: z.literal(true),
  lockfile: HashedArtifactSchema,
  automatedReportHashes: z.array(HashedArtifactSchema).min(1),
  playwrightJsonReport: HashedArtifactSchema,
  buildArtifactDigest: z.string().regex(/^[0-9a-f]{64}$/i),
  deploymentBuildId: nonBlank,
  httpsEnvironment: z.string().url().refine((value) => value.startsWith("https://"), "must use HTTPS"),
  projectSchemaVersion: nonBlank,
  migrationVersion: nonBlank,
  humanEvidenceBundle: HashedArtifactSchema,
  automatedEvidenceBundle: HashedArtifactSchema,
  approvalDecision: z.enum(["approved", "rejected"]),
  approvalTimestamp: z.string().datetime({ offset: true }),
  trustedProductOwnerPublicKeyFingerprint: z.string().regex(/^[0-9a-f]{64}$/i),
}).strict();

export type Phase15HumanEvidenceRow = z.infer<typeof Phase15HumanEvidenceRowSchema>;
export type Phase15HumanEvidenceBundle = z.infer<typeof Phase15HumanEvidenceBundleSchema>;
export type Phase15ReleaseManifest = z.infer<typeof Phase15ReleaseManifestSchema>;

export type Phase15EvidenceIssue = {
  level: "error" | "blocker" | "approval";
  path: string;
  message: string;
};

export function createPhase15HumanEvidenceTemplate(
  generatedAt = new Date().toISOString(),
): Phase15HumanEvidenceBundle {
  return {
    schemaVersion: PHASE15_HUMAN_EVIDENCE_SCHEMA_VERSION,
    generatedAt,
    candidate: {
      candidateIdentifier: null,
      commitSha: null,
      immutableTag: null,
      buildArtifactDigest: null,
      deploymentBuildId: null,
      httpsEnvironment: null,
    },
    rows: PHASE15_HUMAN_EVIDENCE_REQUIREMENTS.map((entry) => ({
      evidenceId: entry.evidenceId,
      requirement: entry.requirement,
      candidateCommitSha: null,
      releaseCandidateTag: null,
      artifactDigest: null,
      deploymentBuildId: null,
      httpsEnvironment: null,
      reviewerIdentifier: null,
      reviewerRole: null,
      reviewTimestamp: null,
      device: null,
      operatingSystem: null,
      browserAndVersion: null,
      testSteps: [...entry.testSteps],
      expectedResult: entry.expectedResult,
      actualResult: "Blocked until an immutable candidate is deployed to the approved HTTPS environment.",
      status: "Blocked",
      evidenceArtifactReference: null,
      evidenceArtifactSha256: null,
      defectReference: null,
      reviewerNotes: "Awaiting execution by an authorized human reviewer.",
      notApplicableJustification: null,
    })),
  };
}

function add(
  issues: Phase15EvidenceIssue[],
  level: Phase15EvidenceIssue["level"],
  path: string,
  message: string,
) {
  issues.push({ level, path, message });
}

function artifactPath(reference: string, repositoryRoot: string) {
  if (isAbsolute(reference)) return null;
  const root = resolve(repositoryRoot);
  const target = resolve(root, reference);
  return target.startsWith(`${root}${sep}`) ? target : null;
}

function sha256Bytes(bytes: string | Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function canonicalizePhase15ReleaseManifest(input: unknown) {
  const manifest = Phase15ReleaseManifestSchema.parse(input);
  return Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
}

function verifyArtifact(
  reference: string,
  expected: string,
  repositoryRoot: string,
  path: string,
  issues: Phase15EvidenceIssue[],
) {
  const target = artifactPath(reference, repositoryRoot);
  if (!target || !existsSync(target) || !statSync(target).isFile()) {
    add(issues, "error", path, "artifact must be a readable repository-relative file");
    return;
  }
  if (sha256Bytes(readFileSync(target)) !== expected.toLowerCase()) {
    add(issues, "error", path, "artifact SHA-256 does not match");
  }
}

function identityValue(
  row: Phase15HumanEvidenceRow,
  field: "candidateCommitSha" | "releaseCandidateTag" | "artifactDigest" | "deploymentBuildId" | "httpsEnvironment",
) {
  return row[field];
}

export function validatePhase15HumanEvidence(
  input: unknown,
  options: {
    repositoryRoot?: string;
    manifest?: Phase15ReleaseManifest;
  } = {},
) {
  const parsed = Phase15HumanEvidenceBundleSchema.safeParse(input);
  const issues: Phase15EvidenceIssue[] = [];
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      add(issues, "error", issue.path.join("."), issue.message);
    }
    return { structurallyValid: false, evidenceComplete: false, data: null, issues };
  }

  const data = parsed.data;
  if (options.manifest) {
    const candidateChecks: Array<[string, string | null, string]> = [
      ["candidateIdentifier", data.candidate.candidateIdentifier, options.manifest.candidateIdentifier],
      ["commitSha", data.candidate.commitSha, options.manifest.commitSha],
      ["immutableTag", data.candidate.immutableTag, options.manifest.immutableTag],
      ["buildArtifactDigest", data.candidate.buildArtifactDigest, options.manifest.buildArtifactDigest],
      ["deploymentBuildId", data.candidate.deploymentBuildId, options.manifest.deploymentBuildId],
      ["httpsEnvironment", data.candidate.httpsEnvironment, options.manifest.httpsEnvironment],
    ];
    for (const [field, actual, expected] of candidateChecks) {
      if (actual !== expected) add(issues, "error", `candidate.${field}`, "bundle candidate identity does not match the manifest");
    }
  }
  const expectedById = new Map(PHASE15_HUMAN_EVIDENCE_REQUIREMENTS.map((entry) => [entry.evidenceId, entry]));
  const seen = new Set<string>();
  for (const [index, row] of data.rows.entries()) {
    const path = `rows[${index}]`;
    if (seen.has(row.evidenceId)) add(issues, "error", `${path}.evidenceId`, "duplicate evidence ID");
    seen.add(row.evidenceId);
    const expected = expectedById.get(row.evidenceId);
    if (!expected) add(issues, "error", `${path}.evidenceId`, "unexpected evidence ID");
    else {
      if (row.requirement !== expected.requirement) add(issues, "error", `${path}.requirement`, "requirement text does not match the canonical row");
      if (JSON.stringify(row.testSteps) !== JSON.stringify(expected.testSteps)) add(issues, "error", `${path}.testSteps`, "test steps do not match the canonical row");
      if (row.expectedResult !== expected.expectedResult) add(issues, "error", `${path}.expectedResult`, "expected result does not match the canonical row");
    }

    const expectedIdentity = options.manifest
      ? {
          candidateCommitSha: options.manifest.commitSha,
          releaseCandidateTag: options.manifest.immutableTag,
          artifactDigest: options.manifest.buildArtifactDigest,
          deploymentBuildId: options.manifest.deploymentBuildId,
          httpsEnvironment: options.manifest.httpsEnvironment,
        }
      : {
          candidateCommitSha: data.candidate.commitSha,
          releaseCandidateTag: data.candidate.immutableTag,
          artifactDigest: data.candidate.buildArtifactDigest,
          deploymentBuildId: data.candidate.deploymentBuildId,
          httpsEnvironment: data.candidate.httpsEnvironment,
        };
    for (const field of Object.keys(expectedIdentity) as Array<keyof typeof expectedIdentity>) {
      if (!identityValue(row, field) || identityValue(row, field) !== expectedIdentity[field]) {
        add(issues, "error", `${path}.${field}`, "row identity is missing or does not match the candidate");
      }
    }

    if (row.status === "Blocked") add(issues, "blocker", `${path}.status`, "human review is blocked or not yet run");
    if (row.status === "Fail") {
      add(issues, "blocker", `${path}.status`, "human evidence failed");
      if (!row.defectReference) add(issues, "error", `${path}.defectReference`, "failed evidence requires a defect reference");
    }
    if (row.status === "Not applicable" && (!row.notApplicableJustification || row.notApplicableJustification.length < 20)) {
      add(issues, "error", `${path}.notApplicableJustification`, "Not applicable requires a written justification of at least 20 characters");
    }
    if (row.status !== "Blocked") {
      for (const field of ["reviewerIdentifier", "reviewerRole", "reviewTimestamp", "device", "operatingSystem", "browserAndVersion", "evidenceArtifactReference", "evidenceArtifactSha256", "reviewerNotes"] as const) {
        if (!row[field]) add(issues, "error", `${path}.${field}`, "completed evidence requires this field");
      }
      if (row.evidenceArtifactReference && row.evidenceArtifactSha256) {
        verifyArtifact(row.evidenceArtifactReference, row.evidenceArtifactSha256, options.repositoryRoot ?? process.cwd(), `${path}.evidenceArtifactReference`, issues);
      }
    }
  }
  for (const id of expectedById.keys()) {
    if (!seen.has(id)) add(issues, "error", "rows", `missing required evidence row ${id}`);
  }
  if (data.rows.length !== PHASE15_HUMAN_EVIDENCE_ROW_COUNT) {
    add(issues, "error", "rows", `expected exactly ${PHASE15_HUMAN_EVIDENCE_ROW_COUNT} rows`);
  }

  return {
    structurallyValid: true,
    evidenceComplete: !issues.some((issue) => issue.level === "error" || issue.level === "blocker"),
    data,
    issues,
  };
}

function trustedEd25519PublicKey(key: string | Buffer | KeyObject) {
  if (key instanceof KeyObject) {
    if (key.type !== "public") throw new Error("trusted product-owner key must be a public key");
    if (key.asymmetricKeyType !== "ed25519") throw new Error("trusted product-owner public key must use Ed25519");
    return key;
  }
  if (/PRIVATE KEY/.test(Buffer.isBuffer(key) ? key.toString("utf8") : key)) {
    throw new Error("trusted product-owner key input must not contain a private key");
  }
  const publicKey = createPublicKey(key);
  if (publicKey.asymmetricKeyType !== "ed25519") {
    throw new Error("trusted product-owner public key must use Ed25519");
  }
  return publicKey;
}

export function productOwnerPublicKeyFingerprint(key: string | Buffer | KeyObject) {
  const publicKey = trustedEd25519PublicKey(key);
  const der = publicKey.export({ type: "spki", format: "der" });
  return sha256Bytes(der);
}

export function validatePhase15ReleasePackage(input: {
  manifest: unknown;
  manifestBytes: Buffer;
  humanEvidence: unknown;
  humanEvidenceBytes: Buffer;
  repositoryRoot?: string;
  detachedSignature?: Buffer;
  trustedProductOwnerPublicKey?: string | Buffer | KeyObject;
}) {
  const issues: Phase15EvidenceIssue[] = [];
  const parsedManifest = Phase15ReleaseManifestSchema.safeParse(input.manifest);
  if (!parsedManifest.success) {
    for (const issue of parsedManifest.error.issues) add(issues, "error", `manifest.${issue.path.join(".")}`, issue.message);
    return { structurallyValid: false, evidenceComplete: false, approvalValid: false, releaseReady: false, issues };
  }
  const manifest = parsedManifest.data;
  const repositoryRoot = input.repositoryRoot ?? process.cwd();
  if (!input.manifestBytes.equals(canonicalizePhase15ReleaseManifest(manifest))) {
    add(issues, "error", "manifest", "manifest bytes are not in the canonical release-manifest encoding");
  }
  for (const artifact of [manifest.lockfile, ...manifest.automatedReportHashes, manifest.playwrightJsonReport, manifest.humanEvidenceBundle, manifest.automatedEvidenceBundle]) {
    verifyArtifact(artifact.path, artifact.sha256, repositoryRoot, `manifest.${artifact.name}`, issues);
  }
  if (sha256Bytes(input.humanEvidenceBytes) !== manifest.humanEvidenceBundle.sha256.toLowerCase()) {
    add(issues, "error", "manifest.humanEvidenceBundle.sha256", "human evidence bundle hash does not match the supplied bytes");
  }
  const human = validatePhase15HumanEvidence(input.humanEvidence, { repositoryRoot, manifest });
  issues.push(...human.issues);
  let approvalValid = false;
  if (!input.trustedProductOwnerPublicKey) {
    add(issues, "approval", "signature", "trusted product-owner public key is required");
  } else if (!input.detachedSignature) {
    add(issues, "approval", "signature", "detached Ed25519 signature is required");
  } else {
    try {
      const trustedPublicKey = trustedEd25519PublicKey(input.trustedProductOwnerPublicKey);
      const fingerprint = productOwnerPublicKeyFingerprint(trustedPublicKey);
      if (fingerprint !== manifest.trustedProductOwnerPublicKeyFingerprint.toLowerCase()) {
        add(issues, "approval", "manifest.trustedProductOwnerPublicKeyFingerprint", "trusted public-key fingerprint does not match the manifest");
      } else if (!verifyEd25519(
        null,
        input.manifestBytes,
        trustedPublicKey,
        input.detachedSignature,
      )) {
        add(issues, "approval", "signature", "detached Ed25519 signature does not verify for the exact manifest bytes");
      } else {
        approvalValid = true;
      }
    } catch (error) {
      add(issues, "approval", "signature", error instanceof Error ? error.message : "signature verification failed");
    }
  }
  const evidenceComplete = human.evidenceComplete && !issues.some((issue) => issue.level === "error" || issue.level === "blocker");
  return {
    structurallyValid: true,
    evidenceComplete,
    approvalValid,
    releaseReady: evidenceComplete && approvalValid && manifest.approvalDecision === "approved",
    issues,
  };
}
