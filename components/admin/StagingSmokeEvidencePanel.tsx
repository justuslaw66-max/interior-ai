"use client";

import { useMemo, useState } from "react";
import type { StagingSmokeEvidenceBundle } from "@/lib/beta-staging-evidence";

type Props = {
  bundle: StagingSmokeEvidenceBundle;
  json: string;
  csv: string;
  markdown: string;
};

function dataHref(mimeType: string, value: string) {
  return `data:${mimeType};charset=utf-8,${encodeURIComponent(value)}`;
}

export default function StagingSmokeEvidencePanel({
  bundle,
  json,
  csv,
  markdown,
}: Props) {
  const [message, setMessage] = useState("");
  const jsonHref = useMemo(() => dataHref("application/json", json), [json]);
  const csvHref = useMemo(() => dataHref("text/csv", csv), [csv]);
  const markdownHref = useMemo(() => dataHref("text/markdown", markdown), [markdown]);

  const copyEvidence = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(`${label} copied.`);
    } catch {
      setMessage(`Could not copy ${label.toLowerCase()}. Download it instead.`);
    }
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
            {bundle.evidence.stagingDeploymentUrl}
          </div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-xs text-neutral-500">Build</div>
          <div className="truncate text-sm font-semibold" data-testid="staging-smoke-build-id">
            {bundle.evidence.buildIdOrCommitSha}
          </div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-xs text-neutral-500">Checkout boundary</div>
          <div className="text-sm font-semibold" data-testid="staging-smoke-checkout-mode">
            {bundle.evidence.checkoutBoundaryResponseMode}
          </div>
        </div>
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
            {bundle.checklistRows.map((row) => (
              <tr
                key={row.id}
                data-testid={`staging-smoke-row-${row.id}`}
                className="border-b align-top"
              >
                <td className="px-2 py-2 font-medium">{row.step}</td>
                <td className="px-2 py-2 text-neutral-600">{row.expectedResult}</td>
                <td className="px-2 py-2">
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-semibold">
                    {row.status}
                  </span>
                </td>
                <td className="px-2 py-2 text-neutral-600">{row.evidenceRequired}</td>
                <td className="px-2 py-2 text-neutral-600">{row.evidenceArtifact || "Pending"}</td>
                <td className="px-2 py-2 text-neutral-600">{row.notes || "Pending staging run"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <div className="font-semibold">Required evidence fields</div>
          <ul className="mt-1 list-disc pl-4">
            {bundle.requiredEvidenceFields.map((field) => (
              <li key={field}>{field}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
          <div className="font-semibold">Hard stops</div>
          <ul className="mt-1 list-disc pl-4">
            {bundle.hardStops.map((stop) => (
              <li key={stop}>{stop}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
