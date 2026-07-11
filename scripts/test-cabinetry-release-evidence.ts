import assert from "node:assert/strict";
import {
  createHash,
  generateKeyPairSync,
  sign as signEd25519,
} from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  ACCESSIBILITY_CRITERIA,
  CABINETRY_RELEASE_EVIDENCE_SCHEMA_VERSION,
  canonicalizeCabinetryReleaseEvidenceForSignature,
  type CabinetryEvidenceArtifact,
  type CabinetryReleaseEvidence,
  type CabinetryReleaseEvidenceRecord,
  type CabinetryReleaseRunEvidence,
  CONSUMER_ACCESS_SMOKE_CRITERIA,
  EXPECTED_RELEASE_EVIDENCE_RECORD_COUNT,
  FINAL_UX_RELEASE_GATE_CRITERIA,
  FULL_MANUAL_SMOKE_CRITERIA,
  GUIDED_QUICK_START_CRITERIA,
  PRO_ACCESS_SMOKE_CRITERIA,
  REQUIRED_ANALYTICS_EVENTS,
  REQUIRED_CABINETRY_BROWSER_TEST_COUNT,
  REQUIRED_FABRICATOR_ARTIFACT_KINDS,
  REQUIRED_RELEASE_GATES,
  REQUIRED_SCENARIO_CRITERIA,
  REQUIRED_TEMPLATE_CHECKS,
  REQUIRED_TEMPLATE_FIRST_TIME_CRITERIA,
  REQUIRED_USABILITY_SCENARIOS,
  validateCabinetryReleaseEvidence,
} from "./cabinetry-release-evidence";

const root = process.cwd();
const seedPath = resolve(root, "reports/cabinetry-studio-release-evidence.v2.json");
const schemaPath = resolve(root, "reports/cabinetry-studio-release-evidence.schema.v2.json");
const qaPath = resolve(root, "docs/qa/cabinetry-studio-mvp.md");
const temporaryEvidenceRoot = mkdtempSync(join(tmpdir(), "cabinetry-release-evidence-"));
const BUILD = {
  releaseCandidateId: "cabinetry-studio-rc-2026-07-10-1",
  commit: "0123456789abcdef0123456789abcdef01234567",
  environment: "release-staging",
  baseUrl: "https://release-staging.interior-ai.test",
} as const;

function parseJsonWithUniqueObjectKeys<T>(source: string, label: string): T {
  let cursor = 0;

  function fail(message: string): never {
    throw new Error(`${label}: ${message} at byte ${cursor}`);
  }

  function skipWhitespace() {
    while (/\s/.test(source[cursor] ?? "")) cursor += 1;
  }

  function parseString(): string {
    const start = cursor;
    if (source[cursor] !== '"') fail("expected a JSON string");
    cursor += 1;
    while (cursor < source.length) {
      if (source[cursor] === "\\") {
        cursor += 2;
        continue;
      }
      if (source[cursor] === '"') {
        cursor += 1;
        return JSON.parse(source.slice(start, cursor)) as string;
      }
      cursor += 1;
    }
    return fail("unterminated JSON string");
  }

  function parseValue(path: string): void {
    skipWhitespace();
    if (source[cursor] === "{") {
      parseObject(path);
      return;
    }
    if (source[cursor] === "[") {
      parseArray(path);
      return;
    }
    if (source[cursor] === '"') {
      parseString();
      return;
    }

    const start = cursor;
    while (cursor < source.length && !/[\s,\]}]/.test(source[cursor])) cursor += 1;
    if (start === cursor) fail("expected a JSON value");
    JSON.parse(source.slice(start, cursor));
  }

  function parseObject(path: string): void {
    cursor += 1;
    skipWhitespace();
    const keys = new Set<string>();
    if (source[cursor] === "}") {
      cursor += 1;
      return;
    }

    while (cursor < source.length) {
      skipWhitespace();
      const key = parseString();
      if (keys.has(key)) fail(`duplicate JSON object key "${key}" in ${path}`);
      keys.add(key);
      skipWhitespace();
      if (source[cursor] !== ":") fail(`expected ':' after key "${key}"`);
      cursor += 1;
      parseValue(`${path}.${key}`);
      skipWhitespace();
      if (source[cursor] === "}") {
        cursor += 1;
        return;
      }
      if (source[cursor] !== ",") fail("expected ',' or '}' in JSON object");
      cursor += 1;
    }
    fail("unterminated JSON object");
  }

  function parseArray(path: string): void {
    cursor += 1;
    skipWhitespace();
    if (source[cursor] === "]") {
      cursor += 1;
      return;
    }

    let index = 0;
    while (cursor < source.length) {
      parseValue(`${path}[${index}]`);
      index += 1;
      skipWhitespace();
      if (source[cursor] === "]") {
        cursor += 1;
        return;
      }
      if (source[cursor] !== ",") fail("expected ',' or ']' in JSON array");
      cursor += 1;
    }
    fail("unterminated JSON array");
  }

  parseValue("$");
  skipWhitespace();
  if (cursor !== source.length) fail("unexpected content after the JSON document");
  return JSON.parse(source) as T;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function artifact(
  kind: CabinetryEvidenceArtifact["kind"],
  name: string,
  content: string | Buffer
): CabinetryEvidenceArtifact {
  const path = join(temporaryEvidenceRoot, name.replace(/[^A-Za-z0-9._-]/g, "-"));
  writeFileSync(path, content);
  return {
    kind,
    path,
    sha256: createHash("sha256").update(content).digest("hex"),
  };
}

function replaceArtifactContent(
  evidence: CabinetryReleaseRunEvidence,
  kind: CabinetryEvidenceArtifact["kind"],
  content: unknown
) {
  const target = evidence.artifacts.find((entry) => entry.kind === kind);
  assert.ok(target, `expected ${kind} artifact`);
  const serialized = typeof content === "string" ? content : JSON.stringify(content, null, 2);
  writeFileSync(target.path, serialized);
  target.sha256 = createHash("sha256").update(serialized).digest("hex");
}

const observedScreenRecording = artifact(
  "screen_recording",
  "observed-session.webm",
  "binary-like observed release recording"
);
const observedSessionNotes = artifact(
  "session_notes",
  "observed-session-notes.txt",
  "Human observer session notes for the release candidate."
);

function blankDetails(): CabinetryReleaseRunEvidence["details"] {
  return {
    usability: null,
    manualGate: null,
    browserSuite: null,
    accessibility: null,
    analytics: null,
    fabricatorReview: null,
  };
}

function makeCommonEvidence(
  kind: CabinetryReleaseRunEvidence["kind"],
  id: string
): CabinetryReleaseRunEvidence {
  return {
    kind,
    observer: {
      name: "Alex Rivera",
      role: "Release evidence observer",
      organization: "Interior AI QA",
    },
    build: { ...BUILD },
    device: {
      label: "Release MacBook Pro",
      category: "laptop",
      os: "macOS 15.5",
      browser: "Chrome 138",
      viewport: { width: 1440, height: 1000, deviceScaleFactor: 2 },
    },
    timing: {
      startedAt: "2026-07-10T01:00:00.000+08:00",
      completedAt: "2026-07-10T01:01:00.000+08:00",
      elapsedSeconds: 60,
    },
    result: {
      outcome: "pass",
      notes: `Observed every documented release-candidate criterion for ${id}.`,
      hesitations: [],
      findings: [],
    },
    artifacts: [clone(observedScreenRecording), clone(observedSessionNotes)],
    attestation: {
      actualReleaseCandidateRun: true,
      notDerivedFromStaticOrUnitChecks: true,
      signedBy: "Alex Rivera",
      signedAt: "2026-07-10T01:02:00.000+08:00",
    },
    details: blankDetails(),
  };
}

function makeUsabilityEvidence(
  id: string,
  profile: "first_time" | "intermediate" | "professional" | "returning"
) {
  const evidence = makeCommonEvidence("observed_usability", id);
  const scenarioId = id.replace("scenario-", "") as keyof typeof REQUIRED_SCENARIO_CRITERIA;
  evidence.details.usability = {
    participantId: `participant-${id}`,
    participantProfile: profile,
    firstTimeWithTemplate: profile === "first_time",
    externalInstructionsUsed: false,
    tasksCompleted: id.startsWith("template-")
      ? [...REQUIRED_TEMPLATE_FIRST_TIME_CRITERIA]
      : [...REQUIRED_SCENARIO_CRITERIA[scenarioId]],
  };
  return evidence;
}

function makeRecord(
  requirement: { readonly id: string; readonly label: string },
  evidence: CabinetryReleaseRunEvidence
): CabinetryReleaseEvidenceRecord {
  return { id: requirement.id, label: requirement.label, status: "pass", evidence };
}

const MANUAL_GATE_CRITERIA: Record<string, readonly string[]> = {
  "consumer-access-smoke": CONSUMER_ACCESS_SMOKE_CRITERIA,
  "pro-access-smoke": PRO_ACCESS_SMOKE_CRITERIA,
  "guided-quick-start-smoke": GUIDED_QUICK_START_CRITERIA,
  "full-manual-smoke": FULL_MANUAL_SMOKE_CRITERIA,
  "final-ux-release-gate": FINAL_UX_RELEASE_GATE_CRITERIA,
};

function makePlaywrightReport() {
  return {
    config: {
      metadata: {
        buildCommit: BUILD.commit,
        releaseEnvironment: BUILD.environment,
      },
    },
    errors: [],
    suites: [
      {
        title: "cabinetry studio",
        file: "cabinetry-studio.spec.ts",
        specs: Array.from({ length: REQUIRED_CABINETRY_BROWSER_TEST_COUNT }, (_, index) => ({
          title: `cabinetry acceptance ${index + 1}`,
          ok: true,
          tests: [{ status: "expected", results: [{ status: "passed", duration: 25 }] }],
        })),
      },
    ],
  };
}

function eventProperties(
  eventName: string,
  accessLevel: "consumer" | "pro"
): Record<string, unknown> {
  const base = { access_level: accessLevel };
  switch (eventName) {
    case "millwork_studio_opened":
      return { ...base, entry_point: "design_controls", studio_mode: "create" };
    case "millwork_template_selected":
      return {
        ...base,
        studio_mode: "create",
        assembly_type: "cabinet",
        module_count: 3,
        preset_id: "base-cabinet",
        template_source: "curated",
      };
    case "millwork_reusable_template_saved":
      return { ...base, studio_mode: "create", assembly_type: "cabinet", module_count: 3 };
    case "millwork_validation_issue_exposed":
      return {
        ...base,
        issue_code: "drawer-clearance",
        severity: "error",
        target_scope: "module",
        module_count: 3,
        elapsed_ms: 1200,
      };
    case "millwork_history_used":
      return { ...base, studio_mode: "create", direction: "undo" };
    case "millwork_validation_fix_applied":
      return {
        ...base,
        studio_mode: "create",
        fix_action: "set_drawer_count",
        confirmation: "preview",
      };
    case "millwork_advanced_controls_opened":
      return { ...base, studio_mode: "create", section: "property_search" };
    case "millwork_export_completed":
      return { ...base, studio_mode: "create", artifact: "package_json" };
    case "millwork_assembly_placed":
      return {
        ...base,
        assembly_type: "cabinet",
        module_count: 3,
        fitted_to_space: true,
        placed_as_copy: false,
        elapsed_ms: 45000,
      };
    case "millwork_assembly_updated":
      return {
        ...base,
        assembly_type: "cabinet",
        module_count: 3,
        fitted_to_space: true,
        reopen_edit_success: true,
        elapsed_ms: 18000,
      };
    case "millwork_studio_closed":
      return {
        ...base,
        studio_mode: "create",
        completed: false,
        elapsed_ms: 52000,
      };
    default:
      throw new Error(`missing fixture payload for ${eventName}`);
  }
}

function makeAnalyticsCapture(accessLevel: "consumer" | "pro"): {
  schemaVersion: string;
  capturedAt: string;
  buildCommit: string;
  environment: string;
  accessLevel: "consumer" | "pro";
  deliveryDestination: string;
  qaHooksEnabled: false;
  events: Array<{
    name: string;
    timestamp: string;
    properties: Record<string, unknown>;
  }>;
} {
  return {
    schemaVersion: "custom_millwork.analytics_capture.v1",
    capturedAt: "2026-07-10T01:01:30.000+08:00",
    buildCommit: BUILD.commit,
    environment: BUILD.environment,
    accessLevel,
    deliveryDestination: "Approved PostHog release project",
    qaHooksEnabled: false,
    events: REQUIRED_ANALYTICS_EVENTS[accessLevel].map((name, index) => ({
      name,
      timestamp: `2026-07-10T01:00:${String(10 + index).padStart(2, "0")}.000+08:00`,
      properties: eventProperties(name, accessLevel),
    })),
  };
}

function makeCompleteEvidence(): CabinetryReleaseEvidence {
  const usabilityScenarios = REQUIRED_USABILITY_SCENARIOS.map((requirement) => {
    const profile =
      requirement.id === "B"
        ? "intermediate"
        : requirement.id === "C"
          ? "professional"
          : requirement.id === "E"
            ? "returning"
            : "first_time";
    const evidence = makeUsabilityEvidence(`scenario-${requirement.id}`, profile);
    if (requirement.id === "A") {
      evidence.timing = {
        startedAt: "2026-07-10T01:00:00.000+08:00",
        completedAt: "2026-07-10T01:01:30.000+08:00",
        elapsedSeconds: 90,
      };
    }
    if (requirement.id === "E") {
      evidence.timing = {
        startedAt: "2026-07-10T01:00:00.000+08:00",
        completedAt: "2026-07-10T01:00:20.000+08:00",
        elapsedSeconds: 20,
      };
    }
    return makeRecord(requirement, evidence);
  });

  const templateFirstTimeChecks = REQUIRED_TEMPLATE_CHECKS.map((requirement) =>
    makeRecord(requirement, makeUsabilityEvidence(`template-${requirement.id}`, "first_time"))
  );

  const releaseGates = REQUIRED_RELEASE_GATES.map((requirement) => {
    const manualCriteria = MANUAL_GATE_CRITERIA[requirement.id];
    if (manualCriteria) {
      const evidence = makeCommonEvidence("observed_manual_smoke", requirement.id);
      evidence.details.manualGate = {
        developerGuidanceUsed: false,
        checksCompleted: [...manualCriteria],
      };
      return makeRecord(requirement, evidence);
    }
    if (requirement.id === "full-browser-suite") {
      const evidence = makeCommonEvidence("release_browser_execution", requirement.id);
      evidence.device.category = "ci-browser";
      const report = artifact(
        "playwright_report",
        "playwright-report.json",
        JSON.stringify(makePlaywrightReport(), null, 2)
      );
      evidence.artifacts = [report];
      evidence.details.browserSuite = {
        command: "npx playwright test tests/e2e/cabinetry-studio.spec.ts --reporter=json",
        discovered: REQUIRED_CABINETRY_BROWSER_TEST_COUNT,
        executed: REQUIRED_CABINETRY_BROWSER_TEST_COUNT,
        passed: REQUIRED_CABINETRY_BROWSER_TEST_COUNT,
        failed: 0,
        skipped: 0,
        reportArtifactPath: report.path,
      };
      return makeRecord(requirement, evidence);
    }
    if (requirement.id === "keyboard-screen-reader-smoke") {
      const evidence = makeCommonEvidence("observed_accessibility", requirement.id);
      evidence.details.accessibility = {
        assistiveTechnologies: [{ name: "VoiceOver", version: "macOS 15.5" }],
        checksCompleted: [...ACCESSIBILITY_CRITERIA],
      };
      return makeRecord(requirement, evidence);
    }
    if (
      requirement.id === "live-analytics-consumer" ||
      requirement.id === "live-analytics-pro"
    ) {
      const accessLevel = requirement.id.endsWith("consumer") ? "consumer" : "pro";
      const evidence = makeCommonEvidence("live_analytics_verification", requirement.id);
      const capture = artifact(
        "analytics_capture",
        `analytics-${accessLevel}.json`,
        JSON.stringify(makeAnalyticsCapture(accessLevel), null, 2)
      );
      evidence.artifacts = [capture];
      evidence.details.analytics = {
        accessLevel,
        captureArtifactPath: capture.path,
        eventsVerified: [...REQUIRED_ANALYTICS_EVENTS[accessLevel]],
      };
      return makeRecord(requirement, evidence);
    }

    const evidence = makeCommonEvidence("fabricator_review", requirement.id);
    evidence.observer = {
      name: "Morgan Lee",
      role: "Fabricator and CNC review lead",
      organization: "Partner Millwork Shop",
    };
    evidence.attestation.signedBy = "Morgan Lee";
    evidence.artifacts = REQUIRED_FABRICATOR_ARTIFACT_KINDS.map((kind) =>
      artifact(kind, `fabricator-${kind}.artifact`, `Reviewed release ${kind} content.`)
    );
    evidence.details.fabricatorReview = {
      fabricatorName: "Partner Millwork Shop",
      reviewerQualification: "CNC programmer and senior cabinetmaker",
      reviewedArtifactKinds: [...REQUIRED_FABRICATOR_ARTIFACT_KINDS],
      decision: "approved",
    };
    return makeRecord(requirement, evidence);
  });

  return {
    schemaVersion: CABINETRY_RELEASE_EVIDENCE_SCHEMA_VERSION,
    generatedAt: "2026-07-10T01:05:00.000+08:00",
    releaseCandidate: {
      id: BUILD.releaseCandidateId,
      buildCommit: BUILD.commit,
      environment: BUILD.environment,
      baseUrl: BUILD.baseUrl,
    },
    usabilityScenarios,
    templateFirstTimeChecks,
    releaseGates,
    approval: null,
  };
}

function signEvidence(
  evidence: CabinetryReleaseEvidence,
  privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"],
  keyId = "product-owner-2026-01"
) {
  evidence.approval = {
    algorithm: "Ed25519",
    keyId,
    ownerName: "Priya Shah",
    ownerRole: "Product Owner",
    signedAt: "2026-07-10T01:04:00.000+08:00",
    signatureBase64: "AA==",
  };
  evidence.approval.signatureBase64 = signEd25519(
    null,
    Buffer.from(canonicalizeCabinetryReleaseEvidenceForSignature(evidence)),
    privateKey
  ).toString("base64");
}

try {
  const seed = JSON.parse(readFileSync(seedPath, "utf8")) as unknown;
  const seedResult = validateCabinetryReleaseEvidence(seed, { repositoryRoot: root });
  assert.equal(seedResult.structurallyValid, true, "seed should be structurally valid");
  assert.equal(seedResult.evidenceComplete, false, "not-run seed cannot be complete");
  assert.equal(seedResult.approvalValid, false, "seed approval must remain absent");
  assert.equal(seedResult.releaseReady, false, "not-run seed must never release");
  assert.equal(seedResult.matrix.length, EXPECTED_RELEASE_EVIDENCE_RECORD_COUNT);
  assert.equal(EXPECTED_RELEASE_EVIDENCE_RECORD_COUNT, 48);
  assert.equal(CONSUMER_ACCESS_SMOKE_CRITERIA.length, 6);
  assert.equal(PRO_ACCESS_SMOKE_CRITERIA.length, 4);
  assert.equal(GUIDED_QUICK_START_CRITERIA.length, 18);
  assert.equal(FULL_MANUAL_SMOKE_CRITERIA.length, 41);
  assert.equal(FINAL_UX_RELEASE_GATE_CRITERIA.length, 13);
  assert.equal(ACCESSIBILITY_CRITERIA.length, 11);
  assert.equal(REQUIRED_FABRICATOR_ARTIFACT_KINDS.length, 26);
  const qaText = readFileSync(qaPath, "utf8");
  function countNumberedChecks(start: string, end: string) {
    const section = qaText.split(start)[1]?.split(end)[0] ?? "";
    return section.split("\n").filter((line) => /^\d+\.\s/.test(line)).length;
  }
  assert.equal(countNumberedChecks("### Consumer / Free", "### Pro"), 6);
  assert.equal(countNumberedChecks("### Pro", "Consumer estimates"), 4);
  assert.equal(
    countNumberedChecks("## Guided Quick Start Smoke", "## Required Usability Scenarios"),
    GUIDED_QUICK_START_CRITERIA.length
  );
  assert.equal(
    countNumberedChecks("## Manual Smoke", "## Notes"),
    FULL_MANUAL_SMOKE_CRITERIA.length
  );
  const finalUxSection =
    qaText.split("## Final UX Release Gate")[1]?.split("## Manual Smoke")[0] ?? "";
  assert.equal(
    finalUxSection.split("\n").filter((line) => /^\d+\.\s/.test(line)).length,
    FINAL_UX_RELEASE_GATE_CRITERIA.length,
    "QA runbook should document every numbered Final UX criterion"
  );
  for (const criterion of FINAL_UX_RELEASE_GATE_CRITERIA) {
    assert.equal(
      finalUxSection.split(`\`${criterion}\``).length - 1,
      1,
      `QA runbook should document Final UX criterion ${criterion} exactly once`
    );
  }
  assert.match(finalUxSection, /screen recording/i);
  assert.match(finalUxSection, /session notes/i);
  assert.match(finalUxSection, /SHA-256/);
  assert.match(finalUxSection, /developerGuidanceUsed` to `false/);
  assert.equal(
    seedResult.issues.filter((issue) => issue.level === "blocker").length,
    48,
    "every seeded not-run row should be an explicit blocker"
  );

  const schemaText = readFileSync(schemaPath, "utf8");
  assert.throws(
    () =>
      parseJsonWithUniqueObjectKeys(
        '{"outer":{"executed":1,"executed":2}}',
        "duplicate-key regression fixture"
      ),
    /duplicate JSON object key "executed"/,
    "source-level duplicate detection must run before JSON.parse can mask a duplicate"
  );
  const jsonSchema = parseJsonWithUniqueObjectKeys<Record<string, unknown>>(
    schemaText,
    "cabinetry release evidence schema"
  );
  assert.equal(jsonSchema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(
    (jsonSchema.properties as Record<string, { const?: string }>).schemaVersion.const,
    CABINETRY_RELEASE_EVIDENCE_SCHEMA_VERSION
  );
  assert.ok(jsonSchema.$defs, "portable JSON Schema should define the evidence contract");
  function assertNoDuplicateEnums(value: unknown, path = "$") {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => assertNoDuplicateEnums(entry, `${path}.${index}`));
      return;
    }
    if (!value || typeof value !== "object") return;
    const object = value as Record<string, unknown>;
    if (Array.isArray(object.enum)) {
      assert.equal(
        new Set(object.enum.map((entry) => JSON.stringify(entry))).size,
        object.enum.length,
        `duplicate enum entry at ${path}`
      );
    }
    Object.entries(object).forEach(([key, entry]) =>
      assertNoDuplicateEnums(entry, `${path}.${key}`)
    );
  }
  assertNoDuplicateEnums(jsonSchema);
  assert.doesNotMatch(
    schemaText,
    /"type"\s*:\s*"object"\s*,\s*"type"\s*:/,
    "portable schema must not contain the previous duplicate type entry"
  );
  assert.equal(
    (schemaText.match(/"observed_manual_smoke"/g) ?? []).length,
    1,
    "evidence-kind enum should not contain duplicate entries"
  );

  const malformed = validateCabinetryReleaseEvidence({ schemaVersion: "wrong" });
  assert.equal(malformed.structurallyValid, false);
  assert.equal(malformed.evidenceComplete, false);
  assert.equal(malformed.releaseReady, false);

  const completeUnsigned = makeCompleteEvidence();
  const completeUnsignedResult = validateCabinetryReleaseEvidence(completeUnsigned, {
    repositoryRoot: root,
  });
  assert.equal(completeUnsignedResult.structurallyValid, true);
  assert.equal(completeUnsignedResult.evidenceComplete, true);
  assert.equal(completeUnsignedResult.approvalValid, false);
  assert.equal(
    completeUnsignedResult.releaseReady,
    false,
    "complete synthetic evidence without trusted signature must not release"
  );

  const arbitraryHttpsArtifact = makeCompleteEvidence();
  arbitraryHttpsArtifact.usabilityScenarios[0].evidence!.artifacts[0].path =
    "https://release-evidence.invalid/recording.webm";
  const arbitraryHttpsResult = validateCabinetryReleaseEvidence(arbitraryHttpsArtifact);
  assert.equal(arbitraryHttpsResult.evidenceComplete, false);
  assert.ok(
    arbitraryHttpsResult.issues.some((issue) => issue.message.includes("readable local file"))
  );

  const wrongHash = makeCompleteEvidence();
  wrongHash.usabilityScenarios[0].evidence!.artifacts[0].sha256 = "0".repeat(64);
  const wrongHashResult = validateCabinetryReleaseEvidence(wrongHash);
  assert.equal(wrongHashResult.evidenceComplete, false);
  assert.ok(wrongHashResult.issues.some((issue) => issue.message.includes("SHA-256")));

  const incompleteScenario = makeCompleteEvidence();
  incompleteScenario.usabilityScenarios[1].evidence!.details.usability!.tasksCompleted =
    incompleteScenario.usabilityScenarios[1].evidence!.details.usability!.tasksCompleted.filter(
      (criterion) => criterion !== "overall_width_set_to_3000mm"
    );
  assert.equal(
    validateCabinetryReleaseEvidence(incompleteScenario).evidenceComplete,
    false,
    "exact scenario criteria are required"
  );

  const wrongReturningProfile = makeCompleteEvidence();
  wrongReturningProfile.usabilityScenarios[4].evidence!.details.usability!.participantProfile =
    "first_time";
  assert.equal(validateCabinetryReleaseEvidence(wrongReturningProfile).evidenceComplete, false);

  const instructedScenario = makeCompleteEvidence();
  instructedScenario.usabilityScenarios[2].evidence!.details.usability!.externalInstructionsUsed =
    true;
  assert.equal(validateCabinetryReleaseEvidence(instructedScenario).evidenceComplete, false);

  const incompleteTemplate = makeCompleteEvidence();
  incompleteTemplate.templateFirstTimeChecks[0].evidence!.details.usability!.tasksCompleted = [
    "recognizable_template_found",
  ];
  assert.equal(validateCabinetryReleaseEvidence(incompleteTemplate).evidenceComplete, false);

  const incompleteAccessibility = makeCompleteEvidence();
  const accessibility = incompleteAccessibility.releaseGates.find(
    (record) => record.id === "keyboard-screen-reader-smoke"
  )!;
  accessibility.evidence!.details.accessibility!.checksCompleted = [
    "keyboard_accessible_inputs",
  ];
  assert.equal(validateCabinetryReleaseEvidence(incompleteAccessibility).evidenceComplete, false);

  const incompleteManualGate = makeCompleteEvidence();
  const guided = incompleteManualGate.releaseGates.find(
    (record) => record.id === "guided-quick-start-smoke"
  )!;
  guided.evidence!.details.manualGate!.checksCompleted.pop();
  assert.equal(validateCabinetryReleaseEvidence(incompleteManualGate).evidenceComplete, false);

  const skippedBrowserRun = makeCompleteEvidence();
  const browser = skippedBrowserRun.releaseGates.find(
    (record) => record.id === "full-browser-suite"
  )!;
  const skippedReport = makePlaywrightReport();
  skippedReport.suites[0].specs[0] = {
    title: "cabinetry acceptance 1",
    ok: false,
    tests: [{ status: "skipped", results: [{ status: "skipped", duration: 0 }] }],
  };
  replaceArtifactContent(browser.evidence!, "playwright_report", skippedReport);
  const skippedResult = validateCabinetryReleaseEvidence(skippedBrowserRun);
  assert.equal(skippedResult.evidenceComplete, false, "parsed browser skips must block");

  const mixedBrowserRun = makeCompleteEvidence();
  const mixedBrowser = mixedBrowserRun.releaseGates.find(
    (record) => record.id === "full-browser-suite"
  )!;
  const mixedReport = makePlaywrightReport();
  mixedReport.suites.push({
    title: "unrelated spec",
    file: "other.spec.ts",
    specs: [
      {
        title: "unrelated acceptance",
        ok: true,
        tests: [{ status: "expected", results: [{ status: "passed", duration: 5 }] }],
      },
    ],
  });
  replaceArtifactContent(mixedBrowser.evidence!, "playwright_report", mixedReport);
  assert.equal(
    validateCabinetryReleaseEvidence(mixedBrowserRun).evidenceComplete,
    false,
    "reports containing another spec must not satisfy the cabinetry browser gate"
  );

  const qaAnalytics = makeCompleteEvidence();
  const consumerAnalytics = qaAnalytics.releaseGates.find(
    (record) => record.id === "live-analytics-consumer"
  )!;
  const qaCapture = makeAnalyticsCapture("consumer");
  qaCapture.environment = "qa";
  replaceArtifactContent(consumerAnalytics.evidence!, "analytics_capture", qaCapture);
  const qaAnalyticsResult = validateCabinetryReleaseEvidence(qaAnalytics);
  assert.equal(qaAnalyticsResult.evidenceComplete, false, "QA analytics cannot satisfy live gate");

  const missingAnalyticsPayload = makeCompleteEvidence();
  const proAnalytics = missingAnalyticsPayload.releaseGates.find(
    (record) => record.id === "live-analytics-pro"
  )!;
  const badCapture = makeAnalyticsCapture("pro");
  const issueExposure = badCapture.events.find(
    (event) => event.name === "millwork_validation_issue_exposed"
  )!;
  delete issueExposure.properties.issue_code;
  replaceArtifactContent(proAnalytics.evidence!, "analytics_capture", badCapture);
  assert.equal(
    validateCabinetryReleaseEvidence(missingAnalyticsPayload).evidenceComplete,
    false,
    "analytics payload fields are parsed, not self-declared"
  );

  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const trustedPublicKey = publicKey.export({ type: "spki", format: "pem" });
  const signed = makeCompleteEvidence();
  signEvidence(signed, privateKey);
  const signedResult = validateCabinetryReleaseEvidence(signed, {
    repositoryRoot: root,
    trustedProductOwnerPublicKey: trustedPublicKey,
    trustedProductOwnerKeyId: "product-owner-2026-01",
  });
  assert.equal(signedResult.evidenceComplete, true);
  assert.equal(signedResult.approvalValid, true);
  assert.equal(signedResult.releaseReady, true, "correct trusted signature should release");

  const signedEvidencePath = join(temporaryEvidenceRoot, "signed-evidence.json");
  const trustedPublicKeyPath = join(temporaryEvidenceRoot, "trusted-product-owner.pem");
  writeFileSync(signedEvidencePath, JSON.stringify(signed, null, 2));
  writeFileSync(trustedPublicKeyPath, trustedPublicKey);
  const signedCli = spawnSync(
    "npm",
    ["run", "check:cabinetry-release-evidence", "--", signedEvidencePath],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        CABINETRY_RELEASE_PRODUCT_OWNER_PUBLIC_KEY_PATH: trustedPublicKeyPath,
        CABINETRY_RELEASE_PRODUCT_OWNER_KEY_ID: "product-owner-2026-01",
      },
    }
  );
  assert.equal(signedCli.status, 0, signedCli.stderr || signedCli.stdout);
  assert.match(signedCli.stdout, /Release evidence gate: READY/);

  const wrongKeyPair = generateKeyPairSync("ed25519");
  const wrongKeyResult = validateCabinetryReleaseEvidence(signed, {
    repositoryRoot: root,
    trustedProductOwnerPublicKey: wrongKeyPair.publicKey,
    trustedProductOwnerKeyId: "product-owner-2026-01",
  });
  assert.equal(wrongKeyResult.evidenceComplete, true);
  assert.equal(wrongKeyResult.approvalValid, false);
  assert.equal(wrongKeyResult.releaseReady, false);

  const signedWaiver = makeCompleteEvidence();
  signedWaiver.usabilityScenarios[0].evidence!.result.findings.push({
    severity: "high",
    summary: "Approved temporary release-candidate exception",
    disposition: "waived",
    issueRef: "issue:MILLWORK-101",
    waiver: {
      ownerName: "Priya Shah",
      ownerRole: "Product Owner",
      rationale: "Accepted for this release candidate with monitored follow-up.",
      approvedAt: "2026-07-10T01:03:00.000+08:00",
    },
  });
  signEvidence(signedWaiver, privateKey);
  const signedWaiverResult = validateCabinetryReleaseEvidence(signedWaiver, {
    trustedProductOwnerPublicKey: trustedPublicKey,
    trustedProductOwnerKeyId: "product-owner-2026-01",
  });
  assert.equal(signedWaiverResult.releaseReady, true);
  signedWaiver.usabilityScenarios[0].evidence!.result.findings[0].waiver!.rationale +=
    " Tampered.";
  const tamperedWaiverResult = validateCabinetryReleaseEvidence(signedWaiver, {
    trustedProductOwnerPublicKey: trustedPublicKey,
    trustedProductOwnerKeyId: "product-owner-2026-01",
  });
  assert.equal(tamperedWaiverResult.evidenceComplete, true);
  assert.equal(tamperedWaiverResult.approvalValid, false);
  assert.equal(tamperedWaiverResult.releaseReady, false, "signature must cover findings and waivers");

  const reportOnly = spawnSync(
    "npm",
    ["run", "check:cabinetry-release-evidence", "--", "--report-only"],
    { cwd: root, encoding: "utf8" }
  );
  assert.equal(reportOnly.status, 0);
  assert.match(reportOnly.stdout, /Evidence completeness: INCOMPLETE/);
  assert.match(reportOnly.stdout, /Product-owner approval: NOT VERIFIED/);

  const failClosed = spawnSync("npm", ["run", "check:cabinetry-release-evidence"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(failClosed.status, 1);
  assert.match(failClosed.stdout, /Blockers: 48/);

  console.log("Cabinetry release evidence v2 validator checks passed.");
} finally {
  rmSync(temporaryEvidenceRoot, { recursive: true, force: true });
}
