"use client";

import { useEffect, useMemo, useState } from "react";
import {
  stagingSmokeEvidenceToCsv,
  stagingSmokeEvidenceToJson,
  stagingSmokeEvidenceToMarkdown,
  type StagingSmokeEvidenceBundle,
  type StagingSmokeEvidenceRecord,
  type StagingSmokeStatus,
} from "@/lib/beta-staging-evidence";

type Props = {
  bundle: StagingSmokeEvidenceBundle;
};

function dataHref(mimeType: string, value: string) {
  return `data:${mimeType};charset=utf-8,${encodeURIComponent(value)}`;
}

const STORAGE_KEY = "interior-ai:staging-smoke-evidence:v1";

const STATUS_OPTIONS: StagingSmokeStatus[] = ["TODO", "PASS", "FAIL", "N/A"];

const evidenceFieldLabels: Record<keyof StagingSmokeEvidenceRecord, string> = {
  stagingDeploymentUrl: "Staging deployment URL",
  buildIdOrCommitSha: "Build ID or commit SHA",
  stagingEnvironmentLabel: "Staging environment",
  tester: "Tester",
  browserDevice: "Browser/device",
  savedDesignId: "Saved design ID",
  shareToken: "Share token",
  editorSnapshotFingerprint: "Editor fingerprint",
  shareSnapshotFingerprint: "Share fingerprint",
  exportSnapshotFingerprint: "Export fingerprint",
  pdfFilename: "PDF filename",
  csvFilename: "CSV filename",
  pngFilename: "PNG filename",
  svgFilename: "SVG filename",
  checkoutBoundaryResponseMode: "Checkout boundary mode",
  checkoutDiagnostics: "Checkout diagnostics",
  catalogCommerceReadinessEvidence: "Catalog readiness evidence",
  feedbackReportId: "Feedback report ID",
};

const evidenceFieldKeys = Object.keys(evidenceFieldLabels) as Array<keyof StagingSmokeEvidenceRecord>;

function cloneBundle(bundle: StagingSmokeEvidenceBundle): StagingSmokeEvidenceBundle {
  return {
    ...bundle,
    checklistRows: bundle.checklistRows.map((row) => ({ ...row })),
    requiredEvidenceFields: [...bundle.requiredEvidenceFields],
    hardStops: [...bundle.hardStops],
    evidence: { ...bundle.evidence },
  };
}

function mergeSavedBundle(
  baseBundle: StagingSmokeEvidenceBundle,
  savedBundle: Partial<StagingSmokeEvidenceBundle>
): StagingSmokeEvidenceBundle {
  const base = cloneBundle(baseBundle);
  const savedRows = new Map((savedBundle.checklistRows ?? []).map((row) => [row.id, row]));

  return {
    ...base,
    generatedAt: savedBundle.generatedAt || base.generatedAt,
    evidence: {
      ...base.evidence,
      ...(savedBundle.evidence ?? {}),
    },
    checklistRows: base.checklistRows.map((baseRow) => {
      const savedRow = savedRows.get(baseRow.id);
      return {
        ...baseRow,
        status: normalizeStatus(String(savedRow?.status ?? baseRow.status)),
        evidenceArtifact: savedRow?.evidenceArtifact ?? baseRow.evidenceArtifact,
        notes: savedRow?.notes ?? baseRow.notes,
      };
    }),
  };
}

function normalizeStatus(value: string): StagingSmokeStatus {
  return STATUS_OPTIONS.includes(value as StagingSmokeStatus)
    ? (value as StagingSmokeStatus)
    : "TODO";
}

function normalizeCheckoutMode(value: string): StagingSmokeEvidenceRecord["checkoutBoundaryResponseMode"] {
  if (
    value === "test checkout URL" ||
    value === "boundary blocked" ||
    value === "checkout disabled"
  ) {
    return value;
  }

  return "boundary blocked";
}

function evidenceLooksComplete(value: string) {
  const normalized = value.trim();
  if (!normalized) return false;
  return !/^(needs|capture|record)\b/i.test(normalized);
}

function statusClass(status: StagingSmokeStatus) {
  if (status === "PASS") return "bg-emerald-50 text-emerald-700";
  if (status === "FAIL") return "bg-red-50 text-red-700";
  if (status === "N/A") return "bg-neutral-100 text-neutral-600";
  return "bg-amber-50 text-amber-700";
}

export default function StagingSmokeEvidencePanel({ bundle }: Props) {
  const [draftBundle, setDraftBundle] = useState<StagingSmokeEvidenceBundle>(() => cloneBundle(bundle));
  const [message, setMessage] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const json = useMemo(() => stagingSmokeEvidenceToJson(draftBundle), [draftBundle]);
  const csv = useMemo(() => stagingSmokeEvidenceToCsv(draftBundle), [draftBundle]);
  const markdown = useMemo(() => stagingSmokeEvidenceToMarkdown(draftBundle), [draftBundle]);
  const jsonHref = useMemo(() => dataHref("application/json", json), [json]);
  const csvHref = useMemo(() => dataHref("text/csv", csv), [csv]);
  const markdownHref = useMemo(() => dataHref("text/markdown", markdown), [markdown]);
  const statusCounts = useMemo(
    () =>
      draftBundle.checklistRows.reduce<Record<StagingSmokeStatus, number>>(
        (counts, row) => {
          counts[row.status] += 1;
          return counts;
        },
        { TODO: 0, PASS: 0, FAIL: 0, "N/A": 0 }
      ),
    [draftBundle.checklistRows]
  );
  const completedEvidenceCount = useMemo(
    () =>
      evidenceFieldKeys.filter((field) => evidenceLooksComplete(String(draftBundle.evidence[field] ?? ""))).length,
    [draftBundle.evidence]
  );
  const rowsResolved = draftBundle.checklistRows.length - statusCounts.TODO;
  const rowsReadyForSignoff = statusCounts.TODO === 0 && statusCounts.FAIL === 0;

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      setDraftBundle(saved ? mergeSavedBundle(bundle, JSON.parse(saved)) : cloneBundle(bundle));
    } catch {
      setDraftBundle(cloneBundle(bundle));
    } finally {
      setHydrated(true);
    }
  }, [bundle]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, stagingSmokeEvidenceToJson(draftBundle));
    } catch {
      setMessage("Worksheet edits could not be stored in this browser.");
    }
  }, [draftBundle, hydrated]);

  const copyEvidence = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(`${label} copied.`);
    } catch {
      setMessage(`Could not copy ${label.toLowerCase()}. Download it instead.`);
    }
  };

  const updateEvidenceField = (field: keyof StagingSmokeEvidenceRecord, value: string) => {
    setDraftBundle((current) => ({
      ...current,
      evidence: {
        ...current.evidence,
        [field]: field === "checkoutBoundaryResponseMode" ? normalizeCheckoutMode(value) : value,
      },
    }));
  };

  const updateRow = (
    rowId: string,
    patch: Partial<Pick<StagingSmokeEvidenceBundle["checklistRows"][number], "status" | "evidenceArtifact" | "notes">>
  ) => {
    setDraftBundle((current) => ({
      ...current,
      checklistRows: current.checklistRows.map((row) =>
        row.id === rowId
          ? {
              ...row,
              ...patch,
              status: patch.status ? normalizeStatus(patch.status) : row.status,
            }
          : row
      ),
    }));
  };

  const resetDraft = () => {
    const next = cloneBundle(bundle);
    setDraftBundle(next);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Resetting the in-memory worksheet is still useful if storage is unavailable.
    }
    setMessage("Worksheet reset to server defaults.");
  };

  return (
    <section className="rounded-xl border p-4" data-testid="staging-smoke-evidence">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Staging Smoke Evidence</h2>
          <p className="mt-1 text-xs text-neutral-600">
            QA-only signoff pack for the beta staging checklist, deployment metadata, fingerprints, exports, and checkout boundary.
          </p>
          <div className="mt-2 text-xs text-neutral-500">Generated: {bundle.generatedAt}</div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <button
            type="button"
            data-testid="staging-smoke-evidence-copy-json"
            onClick={() => copyEvidence(json, "JSON evidence")}
            className="rounded-lg border px-3 py-2 hover:bg-neutral-50"
          >
            Copy JSON
          </button>
          <button
            type="button"
            data-testid="staging-smoke-evidence-copy-markdown"
            onClick={() => copyEvidence(markdown, "Markdown evidence")}
            className="rounded-lg border px-3 py-2 hover:bg-neutral-50"
          >
            Copy Markdown
          </button>
          <button
            type="button"
            data-testid="staging-smoke-evidence-reset"
            onClick={resetDraft}
            className="rounded-lg border px-3 py-2 hover:bg-neutral-50"
          >
            Reset
          </button>
          <a
            data-testid="staging-smoke-evidence-json"
            href={jsonHref}
            download="beta-staging-smoke-evidence.json"
            className="rounded-lg border px-3 py-2 hover:bg-neutral-50"
          >
            Download JSON
          </a>
          <a
            data-testid="staging-smoke-evidence-csv"
            href={csvHref}
            download="beta-staging-smoke-evidence.csv"
            className="rounded-lg border px-3 py-2 hover:bg-neutral-50"
          >
            Download CSV
          </a>
          <a
            data-testid="staging-smoke-evidence-markdown"
            href={markdownHref}
            download="beta-staging-smoke-evidence.md"
            className="rounded-lg border px-3 py-2 hover:bg-neutral-50"
          >
            Download Markdown
          </a>
        </div>
      </div>

      {message ? (
        <div role="status" className="mt-3 rounded-lg border bg-neutral-50 p-2 text-xs text-neutral-700">
          {message}
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-lg border p-3">
          <div className="text-xs text-neutral-500">Deployment</div>
          <div className="truncate text-sm font-semibold" data-testid="staging-smoke-deployment-url">
            {draftBundle.evidence.stagingDeploymentUrl}
          </div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-xs text-neutral-500">Build</div>
          <div className="truncate text-sm font-semibold" data-testid="staging-smoke-build-id">
            {draftBundle.evidence.buildIdOrCommitSha}
          </div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-xs text-neutral-500">Checkout boundary</div>
          <div className="text-sm font-semibold" data-testid="staging-smoke-checkout-mode">
            {draftBundle.evidence.checkoutBoundaryResponseMode}
          </div>
        </div>
      </div>

      <div
        className={`mt-4 rounded-lg border p-3 text-xs ${
          rowsReadyForSignoff
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-amber-200 bg-amber-50 text-amber-800"
        }`}
        data-testid="staging-smoke-progress-summary"
      >
        <div className="font-semibold">
          {rowsResolved}/{draftBundle.checklistRows.length} rows resolved · {completedEvidenceCount}/{evidenceFieldKeys.length} evidence fields filled
        </div>
        <div className="mt-1">
          PASS {statusCounts.PASS} · FAIL {statusCounts.FAIL} · N/A {statusCounts["N/A"]} · TODO {statusCounts.TODO}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {evidenceFieldKeys.map((field) => (
          <label key={field} className="block rounded-lg border p-3">
            <span className="text-xs font-medium text-neutral-500">{evidenceFieldLabels[field]}</span>
            {field === "checkoutBoundaryResponseMode" ? (
              <select
                data-testid="staging-smoke-evidence-field-checkoutBoundaryResponseMode"
                value={draftBundle.evidence.checkoutBoundaryResponseMode}
                onChange={(event) => updateEvidenceField(field, event.currentTarget.value)}
                className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"
              >
                <option value="test checkout URL">test checkout URL</option>
                <option value="boundary blocked">boundary blocked</option>
                <option value="checkout disabled">checkout disabled</option>
              </select>
            ) : field === "checkoutDiagnostics" || field === "catalogCommerceReadinessEvidence" ? (
              <textarea
                data-testid={`staging-smoke-evidence-field-${field}`}
                value={String(draftBundle.evidence[field] ?? "")}
                onChange={(event) => updateEvidenceField(field, event.currentTarget.value)}
                className="mt-1 min-h-20 w-full rounded-lg border px-2 py-2 text-sm"
              />
            ) : (
              <input
                data-testid={`staging-smoke-evidence-field-${field}`}
                value={String(draftBundle.evidence[field] ?? "")}
                onChange={(event) => updateEvidenceField(field, event.currentTarget.value)}
                className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"
              />
            )}
          </label>
        ))}
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-xs">
          <thead>
            <tr className="border-b bg-neutral-50 text-left">
              <th className="px-2 py-2 font-medium">Step</th>
              <th className="px-2 py-2 font-medium">Expected result</th>
              <th className="px-2 py-2 font-medium">Status</th>
              <th className="px-2 py-2 font-medium">Evidence required</th>
              <th className="px-2 py-2 font-medium">Evidence</th>
              <th className="px-2 py-2 font-medium">Notes</th>
            </tr>
          </thead>
          <tbody>
            {draftBundle.checklistRows.map((row) => (
              <tr
                key={row.id}
                data-testid={`staging-smoke-row-${row.id}`}
                className="border-b align-top"
              >
                <td className="px-2 py-2 font-medium">{row.step}</td>
                <td className="px-2 py-2 text-neutral-600">{row.expectedResult}</td>
                <td className="px-2 py-2">
                  <select
                    data-testid={`staging-smoke-row-status-${row.id}`}
                    value={row.status}
                    onChange={(event) => updateRow(row.id, { status: normalizeStatus(event.currentTarget.value) })}
                    className={`rounded-full border-0 px-2 py-1 font-semibold ${statusClass(row.status)}`}
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-2 text-neutral-600">{row.evidenceRequired}</td>
                <td className="px-2 py-2 text-neutral-600">
                  <input
                    data-testid={`staging-smoke-row-evidence-${row.id}`}
                    value={row.evidenceArtifact}
                    placeholder="Evidence link or artifact"
                    onChange={(event) => updateRow(row.id, { evidenceArtifact: event.currentTarget.value })}
                    className="w-full min-w-40 rounded-lg border px-2 py-1.5"
                  />
                </td>
                <td className="px-2 py-2 text-neutral-600">
                  <textarea
                    data-testid={`staging-smoke-row-notes-${row.id}`}
                    value={row.notes}
                    placeholder="Notes"
                    onChange={(event) => updateRow(row.id, { notes: event.currentTarget.value })}
                    className="min-h-16 w-full min-w-48 rounded-lg border px-2 py-1.5"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <div className="font-semibold">Required evidence fields</div>
          <ul className="mt-1 list-disc pl-4">
            {draftBundle.requiredEvidenceFields.map((field) => (
              <li key={field}>{field}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
          <div className="font-semibold">Hard stops</div>
          <ul className="mt-1 list-disc pl-4">
            {draftBundle.hardStops.map((stop) => (
              <li key={stop}>{stop}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
