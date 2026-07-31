import {
  createHash,
  createPublicKey,
  type KeyObject,
  verify as verifyEd25519,
} from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { z } from "zod";

export const CABINETRY_RELEASE_EVIDENCE_SCHEMA_VERSION =
  "custom_millwork.release_evidence.v2" as const;

export const REQUIRED_USABILITY_SCENARIOS = [
  { id: "A", label: "First-time designer — two-minute base cabinet" },
  { id: "B", label: "Intermediate designer — 3000 mm wardrobe" },
  { id: "C", label: "Professional designer — fitted media wall" },
  { id: "D", label: "Error recovery" },
  { id: "E", label: "Returning designer — reopen and edit" },
] as const;

export const REQUIRED_SCENARIO_CRITERIA = {
  A: [
    "studio_found",
    "base_cabinet_template_selected",
    "width_changed",
    "finish_changed",
    "review_understood",
    "valid_assembly_placed",
  ],
  B: [
    "wardrobe_template_used",
    "overall_width_set_to_3000mm",
    "bay_added_or_edited",
    "hanging_drawers_and_shelves_added",
    "widths_distributed_predictably",
    "important_bay_locked",
    "locked_bay_dimension_preserved",
    "preview_remained_valid",
    "bom_generated",
  ],
  C: [
    "host_wall_selected",
    "fit_to_space_used",
    "fit_between_two_boundaries",
    "closed_storage_added",
    "open_shelves_added",
    "finish_panels_added",
    "appropriate_fillers_added",
    "individual_modules_edited",
    "advanced_controls_used_only_where_required",
    "placed_result_updated",
    "host_placement_retained",
    "dependent_geometry_remained_valid",
  ],
  D: [
    "invalid_drawer_dimensions_entered",
    "problem_explained",
    "invalid_module_highlighted",
    "useful_auto_fix_offered",
    "auto_fix_previewed_and_applied",
    "auto_fix_undone",
    "assembly_recovered_without_reset",
    "warning_and_error_states_explained",
  ],
  E: [
    "placed_cabinet_reopened",
    "same_editor_opened",
    "existing_values_prefilled",
    "width_increased_and_saved",
    "asset_id_unchanged",
    "position_and_rotation_unchanged",
    "bom_regenerated",
  ],
} as const;

export const REQUIRED_TEMPLATE_FIRST_TIME_CRITERIA = [
  "recognizable_template_found",
  "default_preview_appeared_automatically",
  "default_dimensions_valid",
  "default_result_visually_credible",
  "default_placeable_without_modification",
  "materials_render_credibly",
  "hardware_position_sensible",
  "expected_use_case_recognizable",
  "basic_options_understandable",
  "advanced_options_contextual",
  "common_flow_completed_without_pro_details",
  "bom_generated",
  "placement_completed",
  "responsive_or_unsupported_viewport_behavior_verified",
  "full_first_time_flow_completed",
] as const;

export const REQUIRED_TEMPLATE_CHECKS = [
  { id: "base-cabinet", label: "Base cabinet" },
  { id: "wall-cabinet", label: "Wall cabinet" },
  { id: "tall-cabinet", label: "Tall cabinet" },
  { id: "wardrobe", label: "Wardrobe" },
  { id: "vanity", label: "Vanity" },
  { id: "tv-console", label: "TV console" },
  { id: "cabinet-run", label: "Cabinet run" },
  { id: "closet-system", label: "Closet system" },
  { id: "media-wall", label: "Media wall" },
  { id: "mudroom-storage", label: "Mudroom storage" },
  { id: "laundry-room", label: "Laundry room" },
  { id: "home-office-built-in", label: "Home office built-in" },
  { id: "library-wall", label: "Library wall" },
  { id: "window-seat", label: "Window seat" },
  { id: "banquette", label: "Banquette" },
  { id: "murphy-bed", label: "Murphy bed" },
  { id: "fold-down-desk", label: "Fold-down desk" },
  { id: "platform-storage-bed", label: "Platform storage bed" },
  { id: "under-stair-storage", label: "Under-stair storage" },
  { id: "room-divider-storage", label: "Room divider storage" },
  { id: "home-bar", label: "Home bar" },
  { id: "kitchen-island", label: "Kitchen island" },
  { id: "pantry-system", label: "Pantry system" },
  { id: "wine-storage", label: "Wine storage" },
  { id: "pet-built-in", label: "Pet built-in" },
  { id: "kids-storage", label: "Kids storage" },
  { id: "hobby-storage", label: "Hobby storage" },
  { id: "wall-paneling", label: "Wall paneling" },
  { id: "slat-wall", label: "Slat wall" },
  { id: "ceiling-beams", label: "Ceiling beams" },
  { id: "coffered-ceiling", label: "Coffered ceiling" },
  { id: "fireplace-surround", label: "Fireplace surround" },
  { id: "trim-package", label: "Trim package" },
] as const;

export const CONSUMER_ACCESS_SMOKE_CRITERIA = [
  "consumer_signed_out_or_free_entry",
  "consumer_opens_guided_setup",
  "consumer_pro_controls_hidden",
  "consumer_guided_flow_and_estimate_verified",
  "consumer_placed_inspector_is_simple",
  "consumer_reopen_preserves_definition_and_transform",
] as const;

export const PRO_ACCESS_SMOKE_CRITERIA = [
  "pro_designer_entry",
  "pro_guided_and_detailed_outputs_available",
  "consumer_definition_unchanged_when_pro_controls_revealed",
  "pro_workspace_preference_and_edit_entry_verified",
] as const;

export const GUIDED_QUICK_START_CRITERIA = [
  "guided_valid_base_preview_on_open",
  "guided_recognizable_template_metadata",
  "guided_search_and_filter_state",
  "guided_step_navigation_preserves_state",
  "guided_measured_host_fit_modes",
  "guided_custom_host_numeric_drafts",
  "guided_numeric_draft_commit_behavior",
  "guided_direct_dimension_handles",
  "guided_auto_manual_sizing_and_locks",
  "guided_semantic_selection_and_contextual_inspector",
  "guided_friendly_and_trade_property_search",
  "guided_visual_choices_and_wardrobe_arrangements",
  "guided_history_and_resets",
  "guided_error_fix_preview_apply_undo",
  "guided_mounted_output_panels_and_actions",
  "guided_first_use_hint_persistence",
  "guided_place_reopen_refit_update",
  "guided_narrow_viewport_behavior",
] as const;

export const FULL_MANUAL_SMOKE_CRITERIA = [
  "manual_pro_feature_flag_entry",
  "manual_launcher_visible",
  "manual_all_33_templates_opened",
  "manual_all_parametric_controls_and_outputs_update",
  "manual_module_crud_preserves_ids",
  "manual_validation_blocks_errors_warns_unusual",
  "manual_source_definition_export_verified",
  "manual_source_definition_import_round_trip",
  "manual_documentation_csv_verified",
  "manual_shop_drawing_svg_verified",
  "manual_fabrication_dxf_verified",
  "manual_asset_rfq_json_verified",
  "manual_asset_package_json_verified",
  "manual_glb_binary_opened",
  "manual_placed_in_2d_3d_selected",
  "manual_selected_inspector_readiness_verified",
  "manual_placed_package_verified",
  "manual_installer_work_order_verified",
  "manual_project_field_verification_verified",
  "manual_project_finish_schedule_verified",
  "manual_project_schedule_json_csv_verified",
  "manual_project_scope_verified",
  "manual_project_procurement_verified",
  "manual_project_quote_verified",
  "manual_project_purchase_readiness_verified",
  "manual_project_fabrication_release_verified",
  "manual_project_approval_package_verified",
  "manual_project_revision_package_verified",
  "manual_project_drawing_set_verified",
  "manual_project_cut_list_verified",
  "manual_project_cnc_batch_verified",
  "manual_project_installation_plan_verified",
  "manual_project_rfq_verified",
  "manual_project_handoff_bundle_verified",
  "manual_inspector_transform_controls_verified",
  "manual_placed_assembly_updated",
  "manual_room_and_transform_preserved",
  "manual_placed_undo_redo_verified",
  "manual_room_switch_preserves_asset",
  "manual_saved_design_reload_verified",
  "manual_consumer_guided_access_verified",
] as const;

export const FINAL_UX_RELEASE_GATE_CRITERIA = [
  "ux_first_time_valid_assembly_quickly",
  "ux_defaults_usable_without_modification",
  "ux_common_workflows_hide_unnecessary_construction",
  "ux_advanced_controls_available_not_intrusive",
  "ux_errors_actionable",
  "ux_automatic_layout_predictable",
  "ux_undo_and_cancel_reliable",
  "ux_save_reload_preserves_visible_result",
  "ux_placed_edit_matches_original_interaction",
  "ux_responsive_on_realistic_assemblies",
  "ux_common_tasks_need_no_cad_terminology",
  "ux_manually_tested_without_developer_guidance",
  "ux_critical_high_findings_disposition_reviewed",
] as const;

export const ACCESSIBILITY_CRITERIA = [
  "not_dependent_entirely_on_3d",
  "visual_actions_have_inspector_equivalents",
  "keyboard_accessible_inputs",
  "proper_labels",
  "visible_focus_state",
  "error_descriptions",
  "unit_labels",
  "accessible_button_names",
  "non_color_warning_and_error_indicators",
  "reasonable_tab_order",
  "preview_canvas_does_not_trap_focus",
] as const;

export const REQUIRED_RELEASE_GATES = [
  { id: "consumer-access-smoke", label: "Consumer / Free access smoke" },
  { id: "pro-access-smoke", label: "Pro access and workspace smoke" },
  { id: "guided-quick-start-smoke", label: "Guided 18-step quick-start smoke" },
  { id: "full-manual-smoke", label: "Full 41-step manual smoke" },
  { id: "final-ux-release-gate", label: "Final UX release-gate observation" },
  { id: "full-browser-suite", label: "Full cabinetry browser acceptance suite" },
  {
    id: "keyboard-screen-reader-smoke",
    label: "Release-candidate keyboard and screen-reader smoke",
  },
  { id: "live-analytics-consumer", label: "Live Consumer analytics verification" },
  { id: "live-analytics-pro", label: "Live Pro analytics verification" },
  {
    id: "glb-export-fabricator-review",
    label: "GLB, project exports, and fabricator review",
  },
] as const;

export const EXPECTED_RELEASE_EVIDENCE_RECORD_COUNT =
  REQUIRED_USABILITY_SCENARIOS.length +
  REQUIRED_TEMPLATE_CHECKS.length +
  REQUIRED_RELEASE_GATES.length;

type RequiredBrowserTestIdentity = {
  id: string;
  file: string;
  title: string;
};

const requiredTestManifest = JSON.parse(
  readFileSync(resolve(process.cwd(), "scripts/required-test-manifest.json"), "utf8")
) as {
  gates?: Array<{
    id?: unknown;
    command?: unknown;
    maxAgeMinutes?: unknown;
    requiredTests?: unknown;
  }>;
};
const cabinetryBrowserGate = requiredTestManifest.gates?.find(
  (gate) => gate.id === "release.cabinetry-browser"
);
if (!Array.isArray(cabinetryBrowserGate?.requiredTests)) {
  throw new Error("Required-test manifest is missing release.cabinetry-browser identities.");
}
if (typeof cabinetryBrowserGate.command !== "string") {
  throw new Error("Required-test manifest is missing the cabinetry browser command.");
}
if (
  typeof cabinetryBrowserGate.maxAgeMinutes !== "number" ||
  !Number.isFinite(cabinetryBrowserGate.maxAgeMinutes) ||
  cabinetryBrowserGate.maxAgeMinutes <= 0
) {
  throw new Error("Required-test manifest is missing cabinetry evidence freshness.");
}
const REQUIRED_CABINETRY_BROWSER_COMMAND = cabinetryBrowserGate.command;
const REQUIRED_CABINETRY_BROWSER_MAX_AGE_MS =
  cabinetryBrowserGate.maxAgeMinutes * 60 * 1000;
export const REQUIRED_CABINETRY_BROWSER_TESTS =
  cabinetryBrowserGate.requiredTests as RequiredBrowserTestIdentity[];
export const REQUIRED_CABINETRY_BROWSER_TEST_COUNT =
  REQUIRED_CABINETRY_BROWSER_TESTS.length;

export const REQUIRED_ANALYTICS_EVENTS = {
  consumer: [
    "millwork_studio_opened",
    "millwork_template_selected",
    "millwork_validation_issue_exposed",
    "millwork_history_used",
    "millwork_validation_fix_applied",
    "millwork_assembly_placed",
    "millwork_assembly_updated",
    "millwork_studio_closed",
  ],
  pro: [
    "millwork_studio_opened",
    "millwork_template_selected",
    "millwork_reusable_template_saved",
    "millwork_validation_issue_exposed",
    "millwork_history_used",
    "millwork_validation_fix_applied",
    "millwork_advanced_controls_opened",
    "millwork_export_completed",
    "millwork_assembly_placed",
    "millwork_assembly_updated",
    "millwork_studio_closed",
  ],
} as const;

export const REQUIRED_FABRICATOR_ARTIFACT_KINDS = [
  "glb",
  "source_definition_json",
  "documentation_csv",
  "shop_drawing_svg",
  "fabrication_dxf",
  "rfq_json",
  "package_json",
  "placed_package_json",
  "installer_work_order_json",
  "project_field_verification_json",
  "project_finish_schedule_json",
  "project_schedule_json",
  "project_schedule_csv",
  "project_scope_json",
  "project_procurement_json",
  "project_quote_json",
  "project_purchase_readiness_json",
  "project_fabrication_release_json",
  "project_approval_package_json",
  "project_revision_package_json",
  "project_drawing_set_json",
  "project_cut_list_json",
  "project_cnc_batch_json",
  "project_installation_plan_json",
  "project_rfq_json",
  "project_handoff_package_json",
] as const;

export const ARTIFACT_KINDS = [
  "screen_recording",
  "screenshot",
  "session_notes",
  "required_test_evidence",
  "playwright_report",
  "analytics_capture",
  ...REQUIRED_FABRICATOR_ARTIFACT_KINDS,
] as const;

const nonBlank = z.string().trim().min(1);
const isoTimestamp = z.string().datetime({ offset: true });
const commitSha = z.string().regex(/^[0-9a-f]{7,40}$/i, "must be a 7–40 character commit SHA");
const sha256 = z.string().regex(/^[0-9a-f]{64}$/i, "must be a SHA-256 digest");
const issueRef = z.union([
  z.string().url().refine((value) => /^https:\/\//i.test(value), "issue URL must use HTTPS"),
  z.string().regex(/^issue:[A-Za-z0-9._/-]+$/, "must be an issue: reference"),
]);

const WaiverSchema = z
  .object({
    ownerName: nonBlank,
    ownerRole: nonBlank,
    rationale: z.string().trim().min(10),
    approvedAt: isoTimestamp,
  })
  .strict();

const FindingSchema = z
  .object({
    severity: z.enum(["critical", "high", "medium", "low"]),
    summary: nonBlank,
    disposition: z.enum(["open", "resolved", "waived"]),
    issueRef: issueRef.nullable(),
    waiver: WaiverSchema.nullable(),
  })
  .strict();

const ArtifactSchema = z
  .object({
    kind: z.enum(ARTIFACT_KINDS),
    path: nonBlank,
    sha256,
  })
  .strict();

const DetailsSchema = z
  .object({
    usability: z
      .object({
        participantId: nonBlank,
        participantProfile: z.enum([
          "first_time",
          "intermediate",
          "professional",
          "returning",
        ]),
        firstTimeWithTemplate: z.boolean(),
        externalInstructionsUsed: z.boolean(),
        tasksCompleted: z.array(nonBlank).min(1),
      })
      .strict()
      .nullable(),
    manualGate: z
      .object({
        developerGuidanceUsed: z.boolean(),
        checksCompleted: z.array(nonBlank).min(1),
      })
      .strict()
      .nullable(),
    browserSuite: z
      .object({
        command: nonBlank,
        discovered: z.number().int().positive(),
        executed: z.number().int().positive(),
        passed: z.number().int().nonnegative(),
        failed: z.number().int().nonnegative(),
        skipped: z.number().int().nonnegative(),
        requiredTestEvidenceArtifactPath: nonBlank,
        reportArtifactPath: nonBlank,
      })
      .strict()
      .nullable(),
    accessibility: z
      .object({
        assistiveTechnologies: z
          .array(z.object({ name: nonBlank, version: nonBlank }).strict())
          .min(1),
        checksCompleted: z.array(z.enum(ACCESSIBILITY_CRITERIA)).min(1),
      })
      .strict()
      .nullable(),
    analytics: z
      .object({
        accessLevel: z.enum(["consumer", "pro"]),
        captureArtifactPath: nonBlank,
        eventsVerified: z.array(nonBlank).min(1),
      })
      .strict()
      .nullable(),
    fabricatorReview: z
      .object({
        fabricatorName: nonBlank,
        reviewerQualification: nonBlank,
        reviewedArtifactKinds: z.array(z.enum(ARTIFACT_KINDS)).min(1),
        decision: z.enum(["approved", "changes_requested"]),
      })
      .strict()
      .nullable(),
  })
  .strict();

const EvidenceSchema = z
  .object({
    kind: z.enum([
      "observed_usability",
      "observed_manual_smoke",
      "release_browser_execution",
      "observed_accessibility",
      "live_analytics_verification",
      "fabricator_review",
    ]),
    observer: z
      .object({ name: nonBlank, role: nonBlank, organization: nonBlank.nullable() })
      .strict(),
    build: z
      .object({
        releaseCandidateId: nonBlank,
        commit: commitSha,
        artifactSha256: sha256,
        environment: nonBlank,
        baseUrl: z.string().url(),
      })
      .strict(),
    device: z
      .object({
        label: nonBlank,
        category: z.enum(["desktop", "laptop", "tablet", "mobile", "ci-browser"]),
        os: nonBlank,
        browser: nonBlank,
        viewport: z
          .object({
            width: z.number().int().min(240).max(10000),
            height: z.number().int().min(240).max(10000),
            deviceScaleFactor: z.number().positive().max(10).nullable(),
          })
          .strict(),
      })
      .strict(),
    timing: z
      .object({
        startedAt: isoTimestamp,
        completedAt: isoTimestamp,
        elapsedSeconds: z.number().positive().max(86400),
      })
      .strict(),
    result: z
      .object({
        outcome: z.enum(["pass", "fail"]),
        notes: z.string().trim().min(10),
        hesitations: z.array(nonBlank),
        findings: z.array(FindingSchema),
      })
      .strict(),
    artifacts: z.array(ArtifactSchema).min(1),
    attestation: z
      .object({
        actualReleaseCandidateRun: z.literal(true),
        notDerivedFromStaticOrUnitChecks: z.literal(true),
        signedBy: nonBlank,
        signedAt: isoTimestamp,
      })
      .strict(),
    details: DetailsSchema,
  })
  .strict();

const RecordSchema = z
  .object({
    id: nonBlank,
    label: nonBlank,
    status: z.enum(["not_run", "pass", "fail"]),
    evidence: EvidenceSchema.nullable(),
  })
  .strict()
  .superRefine((record, ctx) => {
    if (record.status === "not_run" && record.evidence !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["evidence"],
        message: "not_run records must not contain evidence",
      });
    }
    if (record.status !== "not_run" && record.evidence === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["evidence"],
        message: `${record.status} records require evidence`,
      });
    }
    if (record.evidence && record.evidence.result.outcome !== record.status) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["evidence", "result", "outcome"],
        message: "result outcome must match record status",
      });
    }
  });

const ApprovalSchema = z
  .object({
    algorithm: z.literal("Ed25519"),
    keyId: nonBlank,
    ownerName: nonBlank,
    ownerRole: nonBlank,
    signedAt: isoTimestamp,
    signatureBase64: z
      .string()
      .regex(/^[A-Za-z0-9+/]+={0,2}$/, "must be a base64 Ed25519 signature"),
  })
  .strict();

export const CabinetryReleaseEvidenceSchema = z
  .object({
    schemaVersion: z.literal(CABINETRY_RELEASE_EVIDENCE_SCHEMA_VERSION),
    generatedAt: isoTimestamp,
    releaseCandidate: z
      .object({
        id: nonBlank.nullable(),
        buildCommit: commitSha.nullable(),
        artifactSha256: sha256.nullable(),
        environment: nonBlank.nullable(),
        baseUrl: z.string().url().nullable(),
      })
      .strict(),
    usabilityScenarios: z.array(RecordSchema),
    templateFirstTimeChecks: z.array(RecordSchema),
    releaseGates: z.array(RecordSchema),
    approval: ApprovalSchema.nullable(),
  })
  .strict();

export type CabinetryReleaseEvidence = z.infer<typeof CabinetryReleaseEvidenceSchema>;
export type CabinetryReleaseEvidenceRecord = z.infer<typeof RecordSchema>;
export type CabinetryReleaseRunEvidence = z.infer<typeof EvidenceSchema>;
export type CabinetryEvidenceArtifact = z.infer<typeof ArtifactSchema>;

export type ReleaseEvidenceIssue = {
  level: "error" | "blocker" | "approval";
  path: string;
  message: string;
};

export type ReleaseEvidenceMatrixRow = {
  category: "scenario" | "template" | "gate";
  id: string;
  label: string;
  status: "not_run" | "pass" | "fail" | "blocked" | "invalid" | "missing";
  detail: string;
};

export type ReleaseEvidenceValidationOptions = {
  repositoryRoot?: string;
  trustedProductOwnerPublicKey?: string | Buffer | KeyObject;
  trustedProductOwnerKeyId?: string;
};

export type ReleaseEvidenceValidation = {
  structurallyValid: boolean;
  evidenceComplete: boolean;
  approvalValid: boolean;
  releaseReady: boolean;
  data: CabinetryReleaseEvidence | null;
  issues: ReleaseEvidenceIssue[];
  matrix: ReleaseEvidenceMatrixRow[];
};

type RequiredRecord = { readonly id: string; readonly label: string };

const PLACEHOLDER_EXACT = new Set([
  "-",
  "—",
  "anonymous",
  "automated",
  "automated test",
  "automation",
  "bot",
  "chatgpt",
  "ci",
  "codex",
  "fixture",
  "n/a",
  "none",
  "not run",
  "placeholder",
  "sample",
  "synthetic",
  "tbd",
  "test",
  "test user",
  "todo",
  "unknown",
]);

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function isPlaceholder(value: string) {
  const normalized = normalize(value);
  return (
    PLACEHOLDER_EXACT.has(normalized) ||
    /\b(?:placeholder|synthetic fixture)\b/.test(normalized)
  );
}

function addIssue(
  issues: ReleaseEvidenceIssue[],
  level: ReleaseEvidenceIssue["level"],
  path: string,
  message: string
) {
  issues.push({ level, path, message });
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)])
    );
  }
  return value;
}

export function canonicalizeCabinetryReleaseEvidenceForSignature(
  document: CabinetryReleaseEvidence
) {
  const normalizedDocument = CabinetryReleaseEvidenceSchema.parse(document);
  const approval = normalizedDocument.approval
    ? {
        algorithm: normalizedDocument.approval.algorithm,
        keyId: normalizedDocument.approval.keyId,
        ownerName: normalizedDocument.approval.ownerName,
        ownerRole: normalizedDocument.approval.ownerRole,
        signedAt: normalizedDocument.approval.signedAt,
      }
    : null;
  return JSON.stringify(stableValue({ ...normalizedDocument, approval }));
}

function validateRecordSet(
  category: ReleaseEvidenceMatrixRow["category"],
  required: readonly RequiredRecord[],
  actual: CabinetryReleaseEvidenceRecord[],
  issues: ReleaseEvidenceIssue[],
  matrix: ReleaseEvidenceMatrixRow[]
) {
  const expected = new Map(required.map((entry) => [entry.id, entry]));
  const seen = new Set<string>();
  for (const record of actual) {
    if (seen.has(record.id)) {
      addIssue(issues, "error", `${category}.${record.id}`, "duplicate required record id");
    }
    seen.add(record.id);
    if (!expected.has(record.id)) {
      addIssue(issues, "error", `${category}.${record.id}`, "unexpected record id");
    }
  }
  for (const requirement of required) {
    const record = actual.find((candidate) => candidate.id === requirement.id);
    if (!record) {
      addIssue(issues, "error", `${category}.${requirement.id}`, "required record is missing");
      matrix.push({
        category,
        id: requirement.id,
        label: requirement.label,
        status: "missing",
        detail: "Required evidence row is missing",
      });
      continue;
    }
    if (record.label !== requirement.label) {
      addIssue(
        issues,
        "error",
        `${category}.${record.id}.label`,
        `label must be exactly \"${requirement.label}\"`
      );
    }
    matrix.push({
      category,
      id: record.id,
      label: requirement.label,
      status: record.status,
      detail:
        record.status === "not_run"
          ? "No release-candidate evidence recorded"
          : record.status === "fail"
            ? "Executed, but the required result failed"
            : "Evidence recorded; semantic checks follow",
    });
  }
}

function resolveArtifactPath(path: string, repositoryRoot: string) {
  return isAbsolute(path) ? path : resolve(repositoryRoot, path);
}

function readVerifiedArtifact(
  artifact: CabinetryEvidenceArtifact,
  repositoryRoot: string,
  path: string,
  issues: ReleaseEvidenceIssue[]
) {
  if (/^(?:https?:|issue:|data:|blob:|about:)/i.test(artifact.path)) {
    addIssue(
      issues,
      "error",
      `${path}.path`,
      "source evidence must be a readable local file; URLs and issue references are not artifacts"
    );
    return null;
  }
  const absolutePath = resolveArtifactPath(artifact.path, repositoryRoot);
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
    addIssue(issues, "error", `${path}.path`, "source evidence file does not exist");
    return null;
  }
  let content: Buffer;
  try {
    content = readFileSync(absolutePath);
  } catch {
    addIssue(issues, "error", `${path}.path`, "source evidence file is not readable");
    return null;
  }
  if (content.length === 0) {
    addIssue(issues, "error", `${path}.path`, "source evidence file is empty");
    return null;
  }
  const actualHash = createHash("sha256").update(content).digest("hex");
  if (actualHash !== artifact.sha256.toLowerCase()) {
    addIssue(issues, "error", `${path}.sha256`, "SHA-256 does not match the local file");
    return null;
  }
  return content;
}

function findArtifact(
  evidence: CabinetryReleaseRunEvidence,
  kind: CabinetryEvidenceArtifact["kind"],
  expectedPath: string | null,
  path: string,
  issues: ReleaseEvidenceIssue[]
) {
  const matches = evidence.artifacts.filter(
    (artifact) => artifact.kind === kind && (expectedPath === null || artifact.path === expectedPath)
  );
  if (matches.length !== 1) {
    addIssue(
      issues,
      "error",
      `${path}.artifacts`,
      `requires exactly one ${kind} artifact${expectedPath ? ` at ${expectedPath}` : ""}`
    );
    return null;
  }
  return matches[0];
}

function requireArtifactKinds(
  evidence: CabinetryReleaseRunEvidence,
  kinds: readonly CabinetryEvidenceArtifact["kind"][],
  path: string,
  issues: ReleaseEvidenceIssue[]
) {
  for (const kind of kinds) findArtifact(evidence, kind, null, path, issues);
}

function validateEvidenceCommon(
  record: CabinetryReleaseEvidenceRecord,
  path: string,
  release: CabinetryReleaseEvidence,
  repositoryRoot: string,
  issues: ReleaseEvidenceIssue[]
) {
  if (record.status === "not_run") {
    addIssue(issues, "blocker", path, "required release evidence has not been run");
    return;
  }
  if (record.status === "fail") {
    addIssue(issues, "blocker", path, "required release evidence records a failing result");
  }
  const evidence = record.evidence;
  if (!evidence) return;

  for (const [field, value] of [
    ["observer.name", evidence.observer.name],
    ["observer.role", evidence.observer.role],
    ["attestation.signedBy", evidence.attestation.signedBy],
    ["device.label", evidence.device.label],
    ["device.os", evidence.device.os],
    ["device.browser", evidence.device.browser],
    ["build.releaseCandidateId", evidence.build.releaseCandidateId],
    ["build.environment", evidence.build.environment],
  ] as const) {
    if (isPlaceholder(value)) {
      addIssue(
        issues,
        "error",
        `${path}.${field}`,
        "placeholder, bot, fixture, or automated identity is not evidence"
      );
    }
  }
  if (evidence.attestation.signedBy !== evidence.observer.name) {
    addIssue(
      issues,
      "error",
      `${path}.attestation.signedBy`,
      "attestation must be signed by the named observer"
    );
  }
  if (
    !release.releaseCandidate.id ||
    !release.releaseCandidate.buildCommit ||
    !release.releaseCandidate.artifactSha256 ||
    !release.releaseCandidate.environment ||
    !release.releaseCandidate.baseUrl
  ) {
    addIssue(issues, "error", "releaseCandidate", "release candidate metadata is incomplete");
  } else {
    if (evidence.build.releaseCandidateId !== release.releaseCandidate.id) {
      addIssue(issues, "error", `${path}.build.releaseCandidateId`, "does not match release candidate id");
    }
    if (evidence.build.commit !== release.releaseCandidate.buildCommit) {
      addIssue(issues, "error", `${path}.build.commit`, "does not match release candidate commit");
    }
    if (evidence.build.artifactSha256 !== release.releaseCandidate.artifactSha256) {
      addIssue(
        issues,
        "error",
        `${path}.build.artifactSha256`,
        "does not match release candidate artifact"
      );
    }
    if (evidence.build.environment !== release.releaseCandidate.environment) {
      addIssue(issues, "error", `${path}.build.environment`, "does not match release candidate environment");
    }
    if (evidence.build.baseUrl !== release.releaseCandidate.baseUrl) {
      addIssue(issues, "error", `${path}.build.baseUrl`, "does not match release candidate base URL");
    }
  }

  const started = Date.parse(evidence.timing.startedAt);
  const completed = Date.parse(evidence.timing.completedAt);
  const elapsed = (completed - started) / 1000;
  if (!Number.isFinite(elapsed) || elapsed <= 0) {
    addIssue(issues, "error", `${path}.timing`, "completedAt must be after startedAt");
  } else if (Math.abs(elapsed - evidence.timing.elapsedSeconds) > Math.max(5, elapsed * 0.02)) {
    addIssue(issues, "error", `${path}.timing.elapsedSeconds`, "does not agree with timestamps");
  }
  if (Date.parse(evidence.attestation.signedAt) < completed) {
    addIssue(issues, "error", `${path}.attestation.signedAt`, "attestation cannot predate completion");
  }
  if (Date.parse(evidence.attestation.signedAt) > Date.parse(release.generatedAt)) {
    addIssue(issues, "error", `${path}.attestation.signedAt`, "attestation cannot postdate the evidence document");
  }

  const artifactKeys = new Set<string>();
  evidence.artifacts.forEach((artifact, index) => {
    const key = `${artifact.kind}:${artifact.path}`;
    if (artifactKeys.has(key)) {
      addIssue(issues, "error", `${path}.artifacts.${index}`, "duplicate artifact kind/path");
    }
    artifactKeys.add(key);
    readVerifiedArtifact(artifact, repositoryRoot, `${path}.artifacts.${index}`, issues);
  });

  for (const [index, finding] of evidence.result.findings.entries()) {
    const findingPath = `${path}.result.findings.${index}`;
    if (["critical", "high"].includes(finding.severity) && finding.disposition === "open") {
      addIssue(issues, "blocker", findingPath, "critical/high finding remains open");
    }
    if (["critical", "high"].includes(finding.severity) && finding.issueRef === null) {
      addIssue(issues, "error", `${findingPath}.issueRef`, "critical/high finding needs a durable issue reference");
    }
    if (finding.disposition === "waived") {
      if (!finding.waiver) {
        addIssue(issues, "error", `${findingPath}.waiver`, "waived finding needs approval metadata");
      } else if (!/product\s*owner/i.test(finding.waiver.ownerRole)) {
        addIssue(issues, "error", `${findingPath}.waiver.ownerRole`, "waiver owner must be the product owner");
      }
    } else if (finding.waiver !== null) {
      addIssue(issues, "error", `${findingPath}.waiver`, "only waived findings may include a waiver");
    }
  }
}

function requireEvidenceKind(
  record: CabinetryReleaseEvidenceRecord,
  expected: CabinetryReleaseRunEvidence["kind"],
  path: string,
  issues: ReleaseEvidenceIssue[]
) {
  if (record.evidence && record.evidence.kind !== expected) {
    addIssue(
      issues,
      "error",
      `${path}.kind`,
      `requires ${expected}; static/unit/other evidence cannot substitute`
    );
  }
}

function requireOnlyDetail(
  evidence: CabinetryReleaseRunEvidence,
  expected: keyof CabinetryReleaseRunEvidence["details"],
  path: string,
  issues: ReleaseEvidenceIssue[]
) {
  for (const [key, value] of Object.entries(evidence.details)) {
    if (key === expected) {
      if (value === null) {
        addIssue(issues, "error", `${path}.details.${key}`, "required detail is missing");
      }
    } else if (value !== null) {
      addIssue(
        issues,
        "error",
        `${path}.details.${key}`,
        `unrelated detail is not valid for ${expected} evidence`
      );
    }
  }
}

function requireCriteria(
  actual: readonly string[],
  required: readonly string[],
  path: string,
  issues: ReleaseEvidenceIssue[]
) {
  const unique = new Set(actual);
  if (unique.size !== actual.length) {
    addIssue(issues, "error", path, "completed criteria must not contain duplicates");
  }
  for (const criterion of required) {
    if (!unique.has(criterion)) {
      addIssue(issues, "error", path, `missing observed pass criterion ${criterion}`);
    }
  }
}

function validateScenario(record: CabinetryReleaseEvidenceRecord, issues: ReleaseEvidenceIssue[]) {
  const path = `scenario.${record.id}.evidence`;
  requireEvidenceKind(record, "observed_usability", path, issues);
  const evidence = record.evidence;
  if (!evidence) return;
  requireOnlyDetail(evidence, "usability", path, issues);
  requireArtifactKinds(evidence, ["screen_recording", "session_notes"], path, issues);
  const usability = evidence.details.usability;
  if (!usability) return;
  if (isPlaceholder(usability.participantId)) {
    addIssue(issues, "error", `${path}.details.usability.participantId`, "participant needs a non-placeholder identifier");
  }
  requireCriteria(
    usability.tasksCompleted,
    REQUIRED_SCENARIO_CRITERIA[record.id as keyof typeof REQUIRED_SCENARIO_CRITERIA] ?? [],
    `${path}.details.usability.tasksCompleted`,
    issues
  );
  if (usability.externalInstructionsUsed) {
    addIssue(issues, "error", `${path}.details.usability.externalInstructionsUsed`, "usability scenarios cannot use developer/external instructions");
  }
  if (record.id === "A") {
    if (usability.participantProfile !== "first_time" || !usability.firstTimeWithTemplate) {
      addIssue(issues, "error", `${path}.details.usability`, "Scenario A requires a first-time participant");
    }
    if (evidence.timing.elapsedSeconds >= 120) {
      addIssue(issues, "blocker", `${path}.timing.elapsedSeconds`, "Scenario A must finish in under two minutes");
    }
  }
  if (record.id === "B" && usability.participantProfile !== "intermediate") {
    addIssue(issues, "error", `${path}.details.usability.participantProfile`, "Scenario B requires an intermediate participant");
  }
  if (record.id === "C" && usability.participantProfile !== "professional") {
    addIssue(issues, "error", `${path}.details.usability.participantProfile`, "Scenario C requires a professional participant");
  }
  if (record.id === "E") {
    if (usability.participantProfile !== "returning") {
      addIssue(issues, "error", `${path}.details.usability.participantProfile`, "Scenario E requires a returning participant");
    }
    if (evidence.timing.elapsedSeconds >= 30) {
      addIssue(issues, "blocker", `${path}.timing.elapsedSeconds`, "Scenario E must finish in under 30 seconds");
    }
  }
}

function validateTemplateCheck(
  record: CabinetryReleaseEvidenceRecord,
  issues: ReleaseEvidenceIssue[]
) {
  const path = `template.${record.id}.evidence`;
  requireEvidenceKind(record, "observed_usability", path, issues);
  const evidence = record.evidence;
  if (!evidence) return;
  requireOnlyDetail(evidence, "usability", path, issues);
  requireArtifactKinds(evidence, ["screen_recording", "session_notes"], path, issues);
  const usability = evidence.details.usability;
  if (!usability) return;
  if (isPlaceholder(usability.participantId)) {
    addIssue(issues, "error", `${path}.details.usability.participantId`, "participant needs a non-placeholder identifier");
  }
  if (!usability.firstTimeWithTemplate || usability.participantProfile !== "first_time") {
    addIssue(issues, "error", `${path}.details.usability`, "template check requires a first-time participant");
  }
  if (usability.externalInstructionsUsed) {
    addIssue(issues, "error", `${path}.details.usability.externalInstructionsUsed`, "first-time template checks cannot use external instructions");
  }
  requireCriteria(
    usability.tasksCompleted,
    REQUIRED_TEMPLATE_FIRST_TIME_CRITERIA,
    `${path}.details.usability.tasksCompleted`,
    issues
  );
}

const MANUAL_GATE_CRITERIA: Record<string, readonly string[]> = {
  "consumer-access-smoke": CONSUMER_ACCESS_SMOKE_CRITERIA,
  "pro-access-smoke": PRO_ACCESS_SMOKE_CRITERIA,
  "guided-quick-start-smoke": GUIDED_QUICK_START_CRITERIA,
  "full-manual-smoke": FULL_MANUAL_SMOKE_CRITERIA,
  "final-ux-release-gate": FINAL_UX_RELEASE_GATE_CRITERIA,
};

function validateManualGate(record: CabinetryReleaseEvidenceRecord, issues: ReleaseEvidenceIssue[]) {
  const path = `gate.${record.id}.evidence`;
  requireEvidenceKind(record, "observed_manual_smoke", path, issues);
  const evidence = record.evidence;
  if (!evidence) return;
  requireOnlyDetail(evidence, "manualGate", path, issues);
  requireArtifactKinds(evidence, ["screen_recording", "session_notes"], path, issues);
  const details = evidence.details.manualGate;
  if (!details) return;
  if (details.developerGuidanceUsed) {
    addIssue(issues, "error", `${path}.details.manualGate.developerGuidanceUsed`, "manual release testing cannot use developer guidance");
  }
  requireCriteria(
    details.checksCompleted,
    MANUAL_GATE_CRITERIA[record.id] ?? [],
    `${path}.details.manualGate.checksCompleted`,
    issues
  );
}

type PlaywrightJsonSuite = {
  file?: unknown;
  suites?: unknown;
  specs?: unknown;
};

function collectPlaywrightSpecs(
  suites: unknown,
  inheritedFile: string | null,
  result: Array<{
    file: string;
    title: string;
    project: string;
    ok: boolean;
    skipped: boolean;
    executed: boolean;
    retried: boolean;
    annotated: boolean;
  }>
) {
  if (!Array.isArray(suites)) return;
  for (const rawSuite of suites) {
    if (!rawSuite || typeof rawSuite !== "object") continue;
    const suite = rawSuite as PlaywrightJsonSuite & { title?: unknown };
    const suiteFile = typeof suite.file === "string" ? suite.file : inheritedFile;
    if (Array.isArray(suite.specs)) {
      for (const rawSpec of suite.specs) {
        if (!rawSpec || typeof rawSpec !== "object") continue;
        const spec = rawSpec as {
          title?: unknown;
          file?: unknown;
          ok?: unknown;
          tests?: unknown;
        };
        const file = typeof spec.file === "string" ? spec.file : suiteFile ?? "";
        const tests = Array.isArray(spec.tests) ? spec.tests : [];
        const statuses = tests.map((test) => {
          if (!test || typeof test !== "object") {
            return { declared: "", final: "", project: "", retried: false, annotated: false };
          }
          const testObject = test as {
            status?: unknown;
            projectName?: unknown;
            projectId?: unknown;
            annotations?: unknown;
            results?: unknown;
          };
          const results = Array.isArray(testObject.results) ? testObject.results : [];
          const last = results[results.length - 1] as {
            status?: unknown;
            retry?: unknown;
            annotations?: unknown;
          } | undefined;
          return {
            declared: typeof testObject.status === "string" ? testObject.status : "",
            final: typeof last?.status === "string" ? last.status : "",
            project:
              typeof testObject.projectName === "string"
                ? testObject.projectName
                : typeof testObject.projectId === "string"
                  ? testObject.projectId
                  : "",
            retried:
              results.length > 1 ||
              results.some((entry) => {
                const retry = (entry as { retry?: unknown })?.retry;
                return typeof retry === "number" && retry > 0;
              }),
            annotated:
              (Array.isArray(testObject.annotations) && testObject.annotations.length > 0) ||
              (Array.isArray(last?.annotations) && last.annotations.length > 0),
          };
        });
        const skipped =
          statuses.length === 0 ||
          statuses.every(({ declared, final }) => declared === "skipped" || final === "skipped");
        const executed = statuses.some(({ final }) => final.length > 0 && final !== "skipped");
        const ok =
          spec.ok === true &&
          statuses.length > 0 &&
          statuses.every(({ declared, final }) => declared === "expected" && final === "passed");
        for (const status of statuses) {
          result.push({
            file,
            title: typeof spec.title === "string" ? spec.title : "",
            project: status.project,
            ok,
            skipped,
            executed,
            retried: status.retried,
            annotated: status.annotated,
          });
        }
      }
    }
    collectPlaywrightSpecs(suite.suites, suiteFile, result);
  }
}

function collectSecretReportFields(value: unknown, currentPath = "report", result: string[] = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      collectSecretReportFields(entry, `${currentPath}[${index}]`, result)
    );
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      const childPath = `${currentPath}.${key}`;
      if (/(secret|token|password|private.?key|cookie|database.?url|credential)/i.test(key)) {
        result.push(childPath);
      }
      collectSecretReportFields(child, childPath, result);
    }
  }
  return result;
}

function collectMachineLocalReportFields(
  value: unknown,
  currentPath = "report",
  result: string[] = []
) {
  if (typeof value === "string") {
    if (
      /(?:^|[\s"'(])(?:\/(?:Users|home)\/[^/\s]+\/|\/(?:tmp|var\/tmp)\/|\/private\/(?:tmp|var)\/|\/var\/folders\/|[A-Za-z]:[\\/](?:Users|Temp)[\\/])/i.test(
        value
      )
    ) {
      result.push(currentPath);
    }
  } else if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      collectMachineLocalReportFields(entry, `${currentPath}[${index}]`, result)
    );
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      collectMachineLocalReportFields(child, `${currentPath}.${key}`, result);
    }
  }
  return result;
}

function validateBrowserGate(
  record: CabinetryReleaseEvidenceRecord,
  repositoryRoot: string,
  issues: ReleaseEvidenceIssue[]
) {
  const path = `gate.${record.id}.evidence`;
  requireEvidenceKind(record, "release_browser_execution", path, issues);
  const evidence = record.evidence;
  if (!evidence) return;
  requireOnlyDetail(evidence, "browserSuite", path, issues);
  const suite = evidence.details.browserSuite;
  if (!suite) return;
  if (suite.command !== REQUIRED_CABINETRY_BROWSER_COMMAND) {
    addIssue(issues, "error", `${path}.details.browserSuite.command`, "must match the canonical required-test command");
  }
  const requiredEvidenceArtifact = findArtifact(
    evidence,
    "required_test_evidence",
    suite.requiredTestEvidenceArtifactPath,
    path,
    issues
  );
  if (!requiredEvidenceArtifact) return;
  const requiredEvidenceContent = readVerifiedArtifact(
    requiredEvidenceArtifact,
    repositoryRoot,
    `${path}.requiredTestEvidence`,
    issues
  );
  if (!requiredEvidenceContent) return;
  let requiredEvidence: {
    schema?: unknown;
    gateId?: unknown;
    command?: unknown;
    sourceCommitSha?: unknown;
    artifactSha256?: unknown;
    processExitCode?: unknown;
    startedAt?: unknown;
    completedAt?: unknown;
    report?: { path?: unknown; sha256?: unknown };
    result?: unknown;
    diagnostics?: unknown;
  };
  try {
    requiredEvidence = JSON.parse(requiredEvidenceContent.toString("utf8")) as typeof requiredEvidence;
  } catch {
    addIssue(issues, "error", `${path}.requiredTestEvidence`, "required-test evidence is not valid JSON");
    return;
  }
  if (
    requiredEvidence.schema !== "interior-ai.required-test-evidence.v1" ||
    requiredEvidence.gateId !== "release.cabinetry-browser" ||
    requiredEvidence.command !== REQUIRED_CABINETRY_BROWSER_COMMAND ||
    requiredEvidence.sourceCommitSha !== evidence.build.commit ||
    requiredEvidence.artifactSha256 !== evidence.build.artifactSha256 ||
    requiredEvidence.processExitCode !== 0 ||
    requiredEvidence.result !== "passed" ||
    !Array.isArray(requiredEvidence.diagnostics) ||
    requiredEvidence.diagnostics.length !== 0
  ) {
    addIssue(
      issues,
      "blocker",
      `${path}.requiredTestEvidence`,
      "must be a passing process-captured envelope for the exact source and artifact"
    );
  }
  const processStartedAt = Date.parse(String(requiredEvidence.startedAt ?? ""));
  const processCompletedAt = Date.parse(String(requiredEvidence.completedAt ?? ""));
  const observedStartedAt = Date.parse(evidence.timing.startedAt);
  const observedCompletedAt = Date.parse(evidence.timing.completedAt);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(
      String(requiredEvidence.startedAt ?? "")
    ) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(
      String(requiredEvidence.completedAt ?? "")
    ) ||
    !Number.isFinite(processStartedAt) ||
    !Number.isFinite(processCompletedAt) ||
    processCompletedAt < processStartedAt ||
    processCompletedAt - processStartedAt > REQUIRED_CABINETRY_BROWSER_MAX_AGE_MS ||
    Date.now() - processCompletedAt > REQUIRED_CABINETRY_BROWSER_MAX_AGE_MS ||
    processCompletedAt > Date.now() + 5 * 60 * 1000 ||
    processStartedAt < observedStartedAt - 1000 ||
    processCompletedAt > observedCompletedAt + 1000
  ) {
    addIssue(
      issues,
      "blocker",
      `${path}.requiredTestEvidence`,
      "process timestamps must be valid and contained by the observed browser-run interval"
    );
  }
  const artifact = findArtifact(
    evidence,
    "playwright_report",
    suite.reportArtifactPath,
    path,
    issues
  );
  if (!artifact) return;
  if (
    requiredEvidence.report?.path !== artifact.path ||
    requiredEvidence.report?.sha256 !== artifact.sha256
  ) {
    addIssue(
      issues,
      "blocker",
      `${path}.requiredTestEvidence.report`,
      "must bind the attached Playwright report path and SHA-256"
    );
  }
  const content = readVerifiedArtifact(artifact, repositoryRoot, `${path}.playwrightReport`, issues);
  if (!content) return;
  let report: unknown;
  try {
    report = JSON.parse(content.toString("utf8")) as unknown;
  } catch {
    addIssue(issues, "error", `${path}.playwrightReport`, "Playwright report is not valid JSON");
    return;
  }
  if (!report || typeof report !== "object") {
    addIssue(issues, "error", `${path}.playwrightReport`, "Playwright report must be an object");
    return;
  }
  const reportObject = report as {
    config?: unknown;
    suites?: unknown;
    errors?: unknown;
    stats?: unknown;
  };
  const secretReportFields = collectSecretReportFields(reportObject);
  if (secretReportFields.length > 0) {
    addIssue(
      issues,
      "blocker",
      `${path}.playwrightReport`,
      `contains secret-bearing fields: ${secretReportFields.join(", ")}`
    );
  }
  const machineLocalReportFields = collectMachineLocalReportFields(reportObject);
  if (machineLocalReportFields.length > 0) {
    addIssue(
      issues,
      "blocker",
      `${path}.playwrightReport`,
      `contains machine-local paths: ${machineLocalReportFields.join(", ")}`
    );
  }
  const reportStats = reportObject.stats as {
    startTime?: unknown;
    duration?: unknown;
  } | undefined;
  const reportStartTime = Date.parse(String(reportStats?.startTime ?? ""));
  const reportDuration = reportStats?.duration;
  const reportEndTime =
    typeof reportDuration === "number" ? reportStartTime + reportDuration : Number.NaN;
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(
      String(reportStats?.startTime ?? "")
    ) ||
    !Number.isFinite(reportStartTime) ||
    typeof reportDuration !== "number" ||
    reportDuration < 0 ||
    reportStartTime < processStartedAt - 1000 ||
    reportEndTime > processCompletedAt + 1000 ||
    Date.now() - reportEndTime > REQUIRED_CABINETRY_BROWSER_MAX_AGE_MS
  ) {
    addIssue(
      issues,
      "blocker",
      `${path}.playwrightReport.stats`,
      "report timing must be canonical, fresh, and contained by the captured process interval"
    );
  }
  if (Array.isArray(reportObject.errors) && reportObject.errors.length > 0) {
    addIssue(issues, "blocker", `${path}.playwrightReport.errors`, "Playwright report contains top-level errors");
  }
  const config = reportObject.config as {
    configFile?: unknown;
    rootDir?: unknown;
    forbidOnly?: unknown;
    grep?: unknown;
    grepInvert?: unknown;
    shard?: unknown;
    projects?: unknown;
    metadata?: unknown;
  } | undefined;
  const configFile = String(config?.configFile ?? "").replace(/\\/g, "/");
  const rootDir = String(config?.rootDir ?? "").replace(/\\/g, "/");
  if (
    !(
      configFile === "<repository-root>/playwright.config.ts" ||
      configFile === "playwright.config.ts"
    ) ||
    !(rootDir === "<repository-root>/tests/e2e" || rootDir === "tests/e2e")
  ) {
    addIssue(
      issues,
      "blocker",
      `${path}.playwrightReport.config`,
      "must identify the canonical Playwright configuration and test root"
    );
  }
  const projectConfigs = Array.isArray(config?.projects)
    ? config.projects.map(
        (project) =>
          project as { name?: unknown; retries?: unknown; repeatEach?: unknown }
      )
    : [];
  const projects = projectConfigs.map((project) => project.name);
  if (
    config?.forbidOnly !== true ||
    (config?.grep && Object.keys(config.grep as object).length > 0) ||
    config?.grepInvert != null ||
    config?.shard != null ||
    projects.length !== 1 ||
    projects[0] !== "chromium" ||
    projectConfigs[0]?.retries !== 0 ||
    projectConfigs[0]?.repeatEach !== 1
  ) {
    addIssue(
      issues,
      "blocker",
      `${path}.playwrightReport.config`,
      "must forbid focused tests and execute the unfiltered Chromium project"
    );
  }
  const metadata = config?.metadata as {
    gateA3ReleaseBaseURL?: unknown;
    requiredTestEvidence?: {
      schema?: unknown;
      gateId?: unknown;
      sourceCommitSha?: unknown;
      artifactSha256?: unknown;
      releaseCandidateId?: unknown;
      releaseEnvironment?: unknown;
    };
  } | undefined;
  const reportIdentity = metadata?.requiredTestEvidence;
  if (
    reportIdentity?.schema !== "interior-ai.required-test-evidence.v1" ||
    reportIdentity?.gateId !== "release.cabinetry-browser" ||
    reportIdentity?.sourceCommitSha !== evidence.build.commit ||
    reportIdentity?.artifactSha256 !== evidence.build.artifactSha256 ||
    reportIdentity?.releaseCandidateId !== evidence.build.releaseCandidateId ||
    reportIdentity?.releaseEnvironment !== evidence.build.environment ||
    metadata?.gateA3ReleaseBaseURL !== evidence.build.baseUrl
  ) {
    addIssue(
      issues,
      "blocker",
      `${path}.playwrightReport.config.metadata`,
      "must identify the exact release candidate commit, environment, and base URL"
    );
  }
  const specs: Array<{
    file: string;
    title: string;
    project: string;
    ok: boolean;
    skipped: boolean;
    executed: boolean;
    retried: boolean;
    annotated: boolean;
  }> = [];
  collectPlaywrightSpecs(reportObject.suites, null, specs);
  const currentSpecs = specs.filter((spec) => {
    const normalizedFile = spec.file.replace(/\\/g, "/");
    return (
      normalizedFile === "cabinetry-studio.spec.ts" ||
      normalizedFile.endsWith("/tests/e2e/cabinetry-studio.spec.ts")
    );
  });
  if (currentSpecs.length !== specs.length) {
    addIssue(issues, "error", `${path}.playwrightReport.suites`, "report contains tests outside the cabinetry spec");
  }
  const uniqueTitles = new Set(currentSpecs.map((spec) => spec.title));
  const discovered = uniqueTitles.size;
  const skipped = currentSpecs.filter((spec) => spec.skipped).length;
  const executed = currentSpecs.filter((spec) => spec.executed).length;
  const passed = currentSpecs.filter((spec) => spec.ok).length;
  const failed = currentSpecs.filter((spec) => spec.executed && !spec.ok).length;
  const requiredTitles = new Set(REQUIRED_CABINETRY_BROWSER_TESTS.map((test) => test.title));
  const missingRequirements = REQUIRED_CABINETRY_BROWSER_TESTS.filter(
    (test) => !currentSpecs.some((spec) => spec.title === test.title && spec.project === "chromium")
  );
  const unexpectedTitles = [...uniqueTitles].filter((title) => !requiredTitles.has(title));
  if (missingRequirements.length > 0 || unexpectedTitles.length > 0 || discovered !== currentSpecs.length) {
    addIssue(
      issues,
      "blocker",
      `${path}.playwrightReport.suites`,
      `required cabinetry identities differ (missing: ${missingRequirements.map((test) => test.id).join(", ") || "none"}; unexpected: ${unexpectedTitles.join(", ") || "none"})`
    );
  }
  if (
    executed !== discovered ||
    passed !== discovered ||
    failed !== 0 ||
    skipped !== 0 ||
    currentSpecs.some((spec) => spec.retried || spec.annotated)
  ) {
    addIssue(issues, "blocker", `${path}.playwrightReport.suites`, "all required cabinetry tests must execute once and pass without skips, retries, or annotations");
  }
  const declared = {
    discovered: suite.discovered,
    executed: suite.executed,
    passed: suite.passed,
    failed: suite.failed,
    skipped: suite.skipped,
  };
  const parsedCounts = { discovered, executed, passed, failed, skipped };
  if (JSON.stringify(declared) !== JSON.stringify(parsedCounts)) {
    addIssue(issues, "error", `${path}.details.browserSuite`, "declared counts do not match the hashed Playwright report");
  }
  const aggregate = reportObject.stats as {
    expected?: unknown;
    skipped?: unknown;
    unexpected?: unknown;
    flaky?: unknown;
  };
  if (
    aggregate.expected !== passed ||
    aggregate.skipped !== skipped ||
    aggregate.unexpected !== failed ||
    aggregate.flaky !== 0
  ) {
    addIssue(
      issues,
      "blocker",
      `${path}.playwrightReport.stats`,
      "aggregate statistics do not match the parsed cabinetry test results"
    );
  }
}

const AnalyticsCaptureSchema = z
  .object({
    schemaVersion: z.literal("custom_millwork.analytics_capture.v1"),
    capturedAt: isoTimestamp,
    buildCommit: commitSha,
    environment: nonBlank,
    accessLevel: z.enum(["consumer", "pro"]),
    deliveryDestination: nonBlank,
    qaHooksEnabled: z.literal(false),
    events: z
      .array(
        z
          .object({
            name: nonBlank,
            timestamp: isoTimestamp,
            properties: z.record(z.unknown()),
          })
          .strict()
      )
      .min(1),
  })
  .strict();

function validString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function validNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function validateAnalyticsEventPayload(
  eventName: string,
  properties: Record<string, unknown>,
  level: "consumer" | "pro"
) {
  if (properties.access_level !== level) return false;
  switch (eventName) {
    case "millwork_studio_opened":
      return (
        ["create", "edit"].includes(String(properties.studio_mode)) &&
        validString(properties.entry_point)
      );
    case "millwork_template_selected":
      return (
        validString(properties.template_source) &&
        validString(properties.assembly_type) &&
        Number.isInteger(properties.module_count)
      );
    case "millwork_reusable_template_saved":
      return validString(properties.assembly_type) && Number.isInteger(properties.module_count);
    case "millwork_validation_issue_exposed":
      return (
        validString(properties.issue_code) &&
        validString(properties.severity) &&
        validString(properties.target_scope) &&
        Number.isInteger(properties.module_count) &&
        validNumber(properties.elapsed_ms)
      );
    case "millwork_history_used":
      return ["undo", "redo"].includes(String(properties.direction));
    case "millwork_validation_fix_applied":
      return validString(properties.fix_action) && validString(properties.confirmation);
    case "millwork_advanced_controls_opened":
      return validString(properties.section);
    case "millwork_export_completed":
      return validString(properties.artifact);
    case "millwork_assembly_placed":
      return (
        validNumber(properties.elapsed_ms) &&
        Number.isInteger(properties.module_count) &&
        Number(properties.module_count) > 0 &&
        validString(properties.assembly_type) &&
        typeof properties.fitted_to_space === "boolean" &&
        typeof properties.placed_as_copy === "boolean"
      );
    case "millwork_assembly_updated":
      return (
        validNumber(properties.elapsed_ms) &&
        Number.isInteger(properties.module_count) &&
        Number(properties.module_count) > 0 &&
        validString(properties.assembly_type) &&
        typeof properties.fitted_to_space === "boolean" &&
        properties.reopen_edit_success === true
      );
    case "millwork_studio_closed":
      return (
        validNumber(properties.elapsed_ms) &&
        ["create", "edit"].includes(String(properties.studio_mode)) &&
        typeof properties.completed === "boolean"
      );
    default:
      return false;
  }
}

function isForbiddenAnalyticsEnvironment(environment: string) {
  return environment
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .some((segment) => ["qa", "test", "local", "localhost", "dev", "development"].includes(segment));
}

function validateAnalyticsGate(
  record: CabinetryReleaseEvidenceRecord,
  release: CabinetryReleaseEvidence,
  repositoryRoot: string,
  issues: ReleaseEvidenceIssue[]
) {
  const path = `gate.${record.id}.evidence`;
  requireEvidenceKind(record, "live_analytics_verification", path, issues);
  const evidence = record.evidence;
  if (!evidence) return;
  requireOnlyDetail(evidence, "analytics", path, issues);
  const details = evidence.details.analytics;
  if (!details) return;
  const expectedLevel = record.id === "live-analytics-consumer" ? "consumer" : "pro";
  if (details.accessLevel !== expectedLevel) {
    addIssue(issues, "error", `${path}.details.analytics.accessLevel`, `must be ${expectedLevel}`);
  }
  const artifact = findArtifact(
    evidence,
    "analytics_capture",
    details.captureArtifactPath,
    path,
    issues
  );
  if (!artifact) return;
  const content = readVerifiedArtifact(artifact, repositoryRoot, `${path}.analyticsCapture`, issues);
  if (!content) return;
  let raw: unknown;
  try {
    raw = JSON.parse(content.toString("utf8")) as unknown;
  } catch {
    addIssue(issues, "error", `${path}.analyticsCapture`, "analytics capture is not valid JSON");
    return;
  }
  const parsed = AnalyticsCaptureSchema.safeParse(raw);
  if (!parsed.success) {
    addIssue(issues, "error", `${path}.analyticsCapture`, parsed.error.issues[0]?.message ?? "invalid analytics capture");
    return;
  }
  const capture = parsed.data;
  if (capture.accessLevel !== expectedLevel) {
    addIssue(issues, "error", `${path}.analyticsCapture.accessLevel`, "capture access level does not match gate");
  }
  if (capture.buildCommit !== release.releaseCandidate.buildCommit) {
    addIssue(issues, "error", `${path}.analyticsCapture.buildCommit`, "capture commit does not match release candidate");
  }
  if (capture.environment !== release.releaseCandidate.environment) {
    addIssue(issues, "error", `${path}.analyticsCapture.environment`, "capture environment does not match release candidate");
  }
  if (isForbiddenAnalyticsEnvironment(capture.environment)) {
    addIssue(issues, "error", `${path}.analyticsCapture.environment`, "analytics cannot be verified in qa/test/local/dev environments");
  }
  const actualNames = new Set(capture.events.map((event) => event.name));
  const declaredNames = new Set(details.eventsVerified);
  const requiredNames = REQUIRED_ANALYTICS_EVENTS[expectedLevel];
  for (const eventName of requiredNames) {
    if (!declaredNames.has(eventName) || !actualNames.has(eventName)) {
      addIssue(issues, "blocker", `${path}.analyticsCapture.events`, `missing live event ${eventName}`);
      continue;
    }
    const validOccurrence = capture.events.some(
      (event) =>
        event.name === eventName &&
        validateAnalyticsEventPayload(event.name, event.properties, expectedLevel)
    );
    if (!validOccurrence) {
      addIssue(issues, "error", `${path}.analyticsCapture.events`, `${eventName} is missing required payload fields`);
    }
  }
  for (const declared of declaredNames) {
    if (!actualNames.has(declared)) {
      addIssue(issues, "error", `${path}.details.analytics.eventsVerified`, `declared event ${declared} is absent from capture`);
    }
  }
  const started = Date.parse(evidence.timing.startedAt) - 300_000;
  const completed = Date.parse(evidence.timing.completedAt) + 300_000;
  for (const event of capture.events) {
    const timestamp = Date.parse(event.timestamp);
    if (timestamp < started || timestamp > completed) {
      addIssue(issues, "error", `${path}.analyticsCapture.events`, `${event.name} timestamp is outside the observed session`);
    }
  }
}

function validateAccessibilityGate(
  record: CabinetryReleaseEvidenceRecord,
  issues: ReleaseEvidenceIssue[]
) {
  const path = `gate.${record.id}.evidence`;
  requireEvidenceKind(record, "observed_accessibility", path, issues);
  const evidence = record.evidence;
  if (!evidence) return;
  requireOnlyDetail(evidence, "accessibility", path, issues);
  requireArtifactKinds(evidence, ["screen_recording", "session_notes"], path, issues);
  const details = evidence.details.accessibility;
  if (!details) return;
  requireCriteria(
    details.checksCompleted,
    ACCESSIBILITY_CRITERIA,
    `${path}.details.accessibility.checksCompleted`,
    issues
  );
  if (
    !details.assistiveTechnologies.some((technology) =>
      /\b(?:voiceover|nvda|jaws|narrator|talkback|orca|screen\s*reader)\b/i.test(
        technology.name
      )
    )
  ) {
    addIssue(issues, "error", `${path}.details.accessibility.assistiveTechnologies`, "must name a real screen-reader product and version");
  }
}

function validateFabricatorGate(
  record: CabinetryReleaseEvidenceRecord,
  issues: ReleaseEvidenceIssue[]
) {
  const path = `gate.${record.id}.evidence`;
  requireEvidenceKind(record, "fabricator_review", path, issues);
  const evidence = record.evidence;
  if (!evidence) return;
  requireOnlyDetail(evidence, "fabricatorReview", path, issues);
  const review = evidence.details.fabricatorReview;
  if (!review) return;
  if (
    !/\b(?:fabricator|cabinetmaker|cabinet\s*maker|millwork|cnc|manufacturer)\b/i.test(
      `${evidence.observer.role} ${review.reviewerQualification}`
    )
  ) {
    addIssue(issues, "error", `${path}.observer.role`, "requires a qualified millwork/fabrication reviewer");
  }
  if (review.decision !== "approved") {
    addIssue(issues, "blocker", `${path}.details.fabricatorReview.decision`, "fabricator has not approved the reviewed artifacts");
  }
  const reviewed = new Set(review.reviewedArtifactKinds);
  for (const kind of REQUIRED_FABRICATOR_ARTIFACT_KINDS) {
    if (!reviewed.has(kind)) {
      addIssue(issues, "error", `${path}.details.fabricatorReview.reviewedArtifactKinds`, `missing review of ${kind}`);
    }
    findArtifact(evidence, kind, null, path, issues);
  }
}

function validateGate(
  record: CabinetryReleaseEvidenceRecord,
  release: CabinetryReleaseEvidence,
  repositoryRoot: string,
  issues: ReleaseEvidenceIssue[]
) {
  if (MANUAL_GATE_CRITERIA[record.id]) {
    validateManualGate(record, issues);
  } else if (record.id === "full-browser-suite") {
    validateBrowserGate(record, repositoryRoot, issues);
  } else if (record.id === "keyboard-screen-reader-smoke") {
    validateAccessibilityGate(record, issues);
  } else if (record.id === "live-analytics-consumer" || record.id === "live-analytics-pro") {
    validateAnalyticsGate(record, release, repositoryRoot, issues);
  } else if (record.id === "glb-export-fabricator-review") {
    validateFabricatorGate(record, issues);
  }
}

function validateApproval(
  document: CabinetryReleaseEvidence,
  options: ReleaseEvidenceValidationOptions,
  issues: ReleaseEvidenceIssue[]
) {
  const approval = document.approval;
  if (!approval) {
    addIssue(issues, "approval", "approval", "trusted product-owner approval signature is missing");
    return false;
  }
  if (!/product\s*owner/i.test(approval.ownerRole)) {
    addIssue(issues, "approval", "approval.ownerRole", "approval signer must be the product owner");
    return false;
  }
  if (!options.trustedProductOwnerPublicKey || !options.trustedProductOwnerKeyId) {
    addIssue(issues, "approval", "approval", "trusted product-owner public key and key id were not supplied");
    return false;
  }
  if (approval.keyId !== options.trustedProductOwnerKeyId) {
    addIssue(issues, "approval", "approval.keyId", "approval key id does not match the trusted key id");
    return false;
  }
  if (Date.parse(approval.signedAt) > Date.parse(document.generatedAt)) {
    addIssue(issues, "approval", "approval.signedAt", "approval cannot postdate the evidence document");
    return false;
  }
  for (const record of [
    ...document.usabilityScenarios,
    ...document.templateFirstTimeChecks,
    ...document.releaseGates,
  ]) {
    if (record.evidence && Date.parse(approval.signedAt) < Date.parse(record.evidence.attestation.signedAt)) {
      addIssue(issues, "approval", "approval.signedAt", "approval cannot predate evidence attestations");
      return false;
    }
    for (const finding of record.evidence?.result.findings ?? []) {
      if (
        finding.disposition === "waived" &&
        finding.waiver?.ownerName !== approval.ownerName
      ) {
        addIssue(issues, "approval", "approval.ownerName", "signed product owner must own every waiver");
        return false;
      }
      if (
        finding.disposition === "waived" &&
        finding.waiver &&
        Date.parse(finding.waiver.approvedAt) > Date.parse(approval.signedAt)
      ) {
        addIssue(issues, "approval", "approval.signedAt", "approval cannot predate a waiver it signs");
        return false;
      }
    }
  }
  try {
    const key =
      typeof options.trustedProductOwnerPublicKey === "string" ||
      Buffer.isBuffer(options.trustedProductOwnerPublicKey)
        ? createPublicKey(options.trustedProductOwnerPublicKey)
        : options.trustedProductOwnerPublicKey;
    const signature = Buffer.from(approval.signatureBase64, "base64");
    const payload = Buffer.from(canonicalizeCabinetryReleaseEvidenceForSignature(document));
    if (!verifyEd25519(null, payload, key, signature)) {
      addIssue(issues, "approval", "approval.signatureBase64", "Ed25519 signature is invalid for the canonical evidence payload");
      return false;
    }
  } catch (error) {
    addIssue(
      issues,
      "approval",
      "approval.signatureBase64",
      `could not verify product-owner signature: ${error instanceof Error ? error.message : String(error)}`
    );
    return false;
  }
  return true;
}

export function validateCabinetryReleaseEvidence(
  input: unknown,
  options: ReleaseEvidenceValidationOptions = {}
): ReleaseEvidenceValidation {
  const parsed = CabinetryReleaseEvidenceSchema.safeParse(input);
  if (!parsed.success) {
    return {
      structurallyValid: false,
      evidenceComplete: false,
      approvalValid: false,
      releaseReady: false,
      data: null,
      issues: parsed.error.issues.map((issue) => ({
        level: "error" as const,
        path: issue.path.join(".") || "$",
        message: issue.message,
      })),
      matrix: [],
    };
  }

  const data = parsed.data;
  const issues: ReleaseEvidenceIssue[] = [];
  const matrix: ReleaseEvidenceMatrixRow[] = [];
  const repositoryRoot = options.repositoryRoot ?? process.cwd();

  for (const [field, value] of [
    ["id", data.releaseCandidate.id],
    ["environment", data.releaseCandidate.environment],
  ] as const) {
    if (value !== null && isPlaceholder(value)) {
      addIssue(issues, "error", `releaseCandidate.${field}`, "release-candidate metadata cannot be a placeholder");
    }
  }

  validateRecordSet("scenario", REQUIRED_USABILITY_SCENARIOS, data.usabilityScenarios, issues, matrix);
  validateRecordSet("template", REQUIRED_TEMPLATE_CHECKS, data.templateFirstTimeChecks, issues, matrix);
  validateRecordSet("gate", REQUIRED_RELEASE_GATES, data.releaseGates, issues, matrix);

  for (const record of data.usabilityScenarios) {
    validateEvidenceCommon(record, `scenario.${record.id}.evidence`, data, repositoryRoot, issues);
    validateScenario(record, issues);
  }
  for (const record of data.templateFirstTimeChecks) {
    validateEvidenceCommon(record, `template.${record.id}.evidence`, data, repositoryRoot, issues);
    validateTemplateCheck(record, issues);
  }
  for (const record of data.releaseGates) {
    validateEvidenceCommon(record, `gate.${record.id}.evidence`, data, repositoryRoot, issues);
    validateGate(record, data, repositoryRoot, issues);
  }

  const evidenceIssues = issues.filter((issue) => issue.level !== "approval");
  const evidenceComplete =
    evidenceIssues.length === 0 &&
    matrix.length === EXPECTED_RELEASE_EVIDENCE_RECORD_COUNT &&
    matrix.every((row) => row.status === "pass");
  const approvalValid = validateApproval(data, options, issues);

  const invalidPaths = issues
    .filter((issue) => issue.level === "error")
    .map((issue) => issue.path);
  const blockerPaths = issues
    .filter((issue) => issue.level === "blocker")
    .map((issue) => issue.path);
  for (const row of matrix) {
    const prefix = `${row.category}.${row.id}`;
    if (invalidPaths.some((path) => path.startsWith(prefix))) {
      row.status = "invalid";
      row.detail = "Evidence is present but invalid";
    } else if (row.status === "pass" && blockerPaths.some((path) => path.startsWith(prefix))) {
      row.status = "blocked";
      row.detail = "Evidence ran, but a release criterion remains blocked";
    }
  }

  return {
    structurallyValid: true,
    evidenceComplete,
    approvalValid,
    releaseReady: evidenceComplete && approvalValid,
    data,
    issues,
    matrix,
  };
}

export function formatCabinetryReleaseEvidenceMatrix(result: ReleaseEvidenceValidation) {
  const lines = [
    "Custom Millwork Studio release evidence",
    "",
    "Category | ID | Status | Requirement",
    "--- | --- | --- | ---",
  ];
  if (result.matrix.length === 0) {
    lines.push("schema | — | INVALID | Evidence document could not be parsed");
  } else {
    for (const row of result.matrix) {
      lines.push(
        `${row.category} | ${row.id} | ${row.status.toUpperCase().replace(/_/g, " ")} | ${row.label}`
      );
    }
  }
  lines.push(
    "",
    `Structural validity: ${result.structurallyValid ? "PASS" : "FAIL"}`,
    `Evidence completeness: ${result.evidenceComplete ? "COMPLETE" : "INCOMPLETE"}`,
    `Product-owner approval: ${result.approvalValid ? "VERIFIED" : "NOT VERIFIED"}`,
    `Release evidence gate: ${result.releaseReady ? "READY" : "NOT READY"}`,
    `Errors: ${result.issues.filter((issue) => issue.level === "error").length}`,
    `Blockers: ${result.issues.filter((issue) => issue.level === "blocker").length}`,
    `Approval issues: ${result.issues.filter((issue) => issue.level === "approval").length}`
  );
  if (result.issues.length > 0) {
    lines.push("", "Issues:");
    for (const issue of result.issues) {
      lines.push(`- [${issue.level.toUpperCase()}] ${issue.path}: ${issue.message}`);
    }
  }
  return lines.join("\n");
}
