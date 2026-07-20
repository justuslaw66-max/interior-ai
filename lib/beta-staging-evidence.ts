export type StagingSmokeStatus = "TODO" | "PASS" | "FAIL" | "N/A";

export type StagingSmokeChecklistRow = {
  id: string;
  step: string;
  expectedResult: string;
  status: StagingSmokeStatus;
  evidenceRequired: string;
  evidenceArtifact: string;
  notes: string;
};

export type StagingSmokeEvidenceRecord = {
  stagingDeploymentUrl: string;
  buildIdOrCommitSha: string;
  stagingEnvironmentLabel: string;
  tester: string;
  browserDevice: string;
  savedDesignId: string;
  shareReferenceFingerprint: string;
  editorSnapshotFingerprint: string;
  shareSnapshotFingerprint: string;
  exportSnapshotFingerprint: string;
  pdfFilename: string;
  csvFilename: string;
  pngFilename: string;
  svgFilename: string;
  checkoutBoundaryResponseMode: "test checkout URL" | "boundary blocked" | "checkout disabled";
  checkoutDiagnostics: string;
  catalogCommerceReadinessEvidence: string;
  feedbackReportId: string;
};

export type StagingSmokeEvidenceBundle = {
  generatedAt: string;
  checklistRows: StagingSmokeChecklistRow[];
  requiredEvidenceFields: string[];
  hardStops: string[];
  evidence: StagingSmokeEvidenceRecord;
};

const DEFAULT_STATUS: StagingSmokeStatus = "TODO";

export const STAGING_SMOKE_CHECKLIST_ROWS: StagingSmokeChecklistRow[] = [
  {
    id: "open_design_signed_out",
    step: "Open staging `/design` signed out",
    expectedResult: "Beta start/editor shell renders without server errors",
    status: DEFAULT_STATUS,
    evidenceRequired: "URL and screenshot",
    evidenceArtifact: "",
    notes: "",
  },
  {
    id: "sign_in",
    step: "Sign in or create a staging test user",
    expectedResult: "User session is established and `/design` remains usable",
    status: DEFAULT_STATUS,
    evidenceRequired: "Account email and screenshot",
    evidenceArtifact: "",
    notes: "",
  },
  {
    id: "start_from_template",
    step: "Start from template",
    expectedResult: "Template applies and shows at least one editable room",
    status: DEFAULT_STATUS,
    evidenceRequired: "Screenshot",
    evidenceArtifact: "",
    notes: "",
  },
  {
    id: "edit_room_2d",
    step: "Add or edit a room in 2D",
    expectedResult: "Room controls update dimensions/material/opening state",
    status: DEFAULT_STATUS,
    evidenceRequired: "Screenshot",
    evidenceArtifact: "",
    notes: "",
  },
  {
    id: "manual_furniture",
    step: "Place furniture manually",
    expectedResult: "Smart placement guidance appears when placement is blocked, cramped, or improvable",
    status: DEFAULT_STATUS,
    evidenceRequired: "Screenshot",
    evidenceArtifact: "",
    notes: "",
  },
  {
    id: "smart_placement",
    step: "Verify smart placement actions",
    expectedResult: "Improve placement, best room/option, restore valid spot, and keyboard controls behave predictably",
    status: DEFAULT_STATUS,
    evidenceRequired: "Notes and screenshot",
    evidenceArtifact: "",
    notes: "",
  },
  {
    id: "shopping_readiness",
    step: "Fix shopping readiness",
    expectedResult: "Replacement suggestions only show products with valid price and retailer URL",
    status: DEFAULT_STATUS,
    evidenceRequired: "Screenshot plus product IDs",
    evidenceArtifact: "",
    notes: "",
  },
  {
    id: "save_reload",
    step: "Save and reload",
    expectedResult: "Reloaded editor snapshot matches saved state visually and functionally",
    status: DEFAULT_STATUS,
    evidenceRequired: "Screenshot and saved design ID",
    evidenceArtifact: "",
    notes: "",
  },
  {
    id: "share_link",
    step: "Create and open share link",
    expectedResult: "Public share page renders the exact saved snapshot and shopping readiness",
    status: DEFAULT_STATUS,
    evidenceRequired: "Share URL and screenshot",
    evidenceArtifact: "",
    notes: "",
  },
  {
    id: "export_pdf",
    step: "Export PDF",
    expectedResult: "PDF downloads/opens and is non-empty",
    status: DEFAULT_STATUS,
    evidenceRequired: "Filename and screenshot",
    evidenceArtifact: "",
    notes: "",
  },
  {
    id: "export_csv",
    step: "Export shopping CSV",
    expectedResult: "CSV downloads and includes expected headers plus at least one cart-ready row",
    status: DEFAULT_STATUS,
    evidenceRequired: "Filename and first row hash",
    evidenceArtifact: "",
    notes: "",
  },
  {
    id: "export_plan_artifacts",
    step: "Export 2D PNG/SVG",
    expectedResult: "Plan artifact downloads and is visually non-empty",
    status: DEFAULT_STATUS,
    evidenceRequired: "Filenames and screenshot",
    evidenceArtifact: "",
    notes: "",
  },
  {
    id: "retailer_link",
    step: "Open retailer link",
    expectedResult: "Retailer click opens with tracking parameters and reaches external retailer page",
    status: DEFAULT_STATUS,
    evidenceRequired: "URL redacted if needed",
    evidenceArtifact: "",
    notes: "",
  },
  {
    id: "checkout_boundary",
    step: "Start checkout boundary",
    expectedResult: "Stripe/checkout start returns a staging/test checkout URL or expected configured boundary response",
    status: DEFAULT_STATUS,
    evidenceRequired: "Redacted response diagnostics",
    evidenceArtifact: "",
    notes: "",
  },
];

export const STAGING_SMOKE_REQUIRED_EVIDENCE_FIELDS = [
  "Staging deployment URL",
  "Build ID or commit SHA",
  "Staging environment label",
  "Test user email",
  "Saved design ID",
  "Share reference fingerprint (never the token)",
  "Editor snapshot fingerprint",
  "Share snapshot fingerprint",
  "Export snapshot fingerprint",
  "PDF filename",
  "CSV filename",
  "PNG filename",
  "SVG filename",
  "Checkout boundary response mode",
  "Checkout diagnostics screenshot or redacted JSON",
  "Catalog commerce readiness screenshot",
  "Feedback report ID or copied payload filename",
];

export const STAGING_SMOKE_HARD_STOPS = [
  "Do not complete a real payment in staging unless staging payment credentials and test payment completion are explicitly approved.",
  "Do not proceed to beta tag if share/export snapshot fidelity diverges from saved editor state.",
  "Do not proceed if any public catalog product shown in replacement suggestions lacks a positive price and valid retailer URL.",
  "Do not proceed if checkout start uses live Stripe keys or a production database in staging.",
];

const EMPTY_EVIDENCE = "Needs staging evidence";

export function buildStagingSmokeEvidenceBundle(input: {
  generatedAt?: Date;
  evidence?: Partial<StagingSmokeEvidenceRecord>;
  rows?: StagingSmokeChecklistRow[];
}): StagingSmokeEvidenceBundle {
  const evidence = input.evidence ?? {};

  return {
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    checklistRows: (input.rows ?? STAGING_SMOKE_CHECKLIST_ROWS).map((row) => ({ ...row })),
    requiredEvidenceFields: [...STAGING_SMOKE_REQUIRED_EVIDENCE_FIELDS],
    hardStops: [...STAGING_SMOKE_HARD_STOPS],
    evidence: {
      stagingDeploymentUrl: evidence.stagingDeploymentUrl ?? EMPTY_EVIDENCE,
      buildIdOrCommitSha: evidence.buildIdOrCommitSha ?? EMPTY_EVIDENCE,
      stagingEnvironmentLabel: evidence.stagingEnvironmentLabel ?? EMPTY_EVIDENCE,
      tester: evidence.tester ?? EMPTY_EVIDENCE,
      browserDevice: evidence.browserDevice ?? EMPTY_EVIDENCE,
      savedDesignId: evidence.savedDesignId ?? EMPTY_EVIDENCE,
      shareReferenceFingerprint: evidence.shareReferenceFingerprint ?? EMPTY_EVIDENCE,
      editorSnapshotFingerprint: evidence.editorSnapshotFingerprint ?? EMPTY_EVIDENCE,
      shareSnapshotFingerprint: evidence.shareSnapshotFingerprint ?? EMPTY_EVIDENCE,
      exportSnapshotFingerprint: evidence.exportSnapshotFingerprint ?? EMPTY_EVIDENCE,
      pdfFilename: evidence.pdfFilename ?? EMPTY_EVIDENCE,
      csvFilename: evidence.csvFilename ?? EMPTY_EVIDENCE,
      pngFilename: evidence.pngFilename ?? EMPTY_EVIDENCE,
      svgFilename: evidence.svgFilename ?? EMPTY_EVIDENCE,
      checkoutBoundaryResponseMode: evidence.checkoutBoundaryResponseMode ?? "boundary blocked",
      checkoutDiagnostics: evidence.checkoutDiagnostics ?? EMPTY_EVIDENCE,
      catalogCommerceReadinessEvidence: evidence.catalogCommerceReadinessEvidence ?? EMPTY_EVIDENCE,
      feedbackReportId: evidence.feedbackReportId ?? EMPTY_EVIDENCE,
    },
  };
}

function csvEscape(value: unknown) {
  const escaped = String(value ?? "").replace(/"/g, '""');
  return `"${escaped}"`;
}

export function stagingSmokeEvidenceToCsv(bundle: StagingSmokeEvidenceBundle): string {
  const rows: string[][] = [
    ["generated_at", bundle.generatedAt],
    [],
    ["field", "value"],
    ...Object.entries(bundle.evidence).map(([field, value]) => [field, String(value)]),
    [],
    ["checklist_id", "step", "expected_result", "status", "evidence_required", "evidence_artifact", "notes"],
    ...bundle.checklistRows.map((row) => [
      row.id,
      row.step,
      row.expectedResult,
      row.status,
      row.evidenceRequired,
      row.evidenceArtifact,
      row.notes,
    ]),
    [],
    ["hard_stops"],
    ...bundle.hardStops.map((stop) => [stop]),
  ];

  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

export function stagingSmokeEvidenceToMarkdown(bundle: StagingSmokeEvidenceBundle): string {
  const evidenceRows = Object.entries(bundle.evidence)
    .map(([field, value]) => `- ${field}: ${value}`)
    .join("\n");
  const checklistRows = bundle.checklistRows
    .map(
      (row) =>
        `| ${row.step} | ${row.expectedResult} | \`${row.status}\` | ${row.evidenceRequired} | ${row.evidenceArtifact} | ${row.notes} |`
    )
    .join("\n");
  const hardStops = bundle.hardStops.map((stop) => `- ${stop}`).join("\n");

  return [
    "# Beta Staging Smoke Evidence",
    "",
    `Generated: ${bundle.generatedAt}`,
    "",
    "## Evidence Fields",
    "",
    evidenceRows,
    "",
    "## Smoke Path",
    "",
    "| Step | Expected result | Status | Evidence required | Evidence link/artifact | Notes |",
    "| --- | --- | --- | --- | --- | --- |",
    checklistRows,
    "",
    "## Hard Stops",
    "",
    hardStops,
  ].join("\n");
}

export function stagingSmokeEvidenceToJson(bundle: StagingSmokeEvidenceBundle): string {
  return JSON.stringify(bundle, null, 2);
}
