"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import {
  cancelFloorPlanAdminJobMutation,
  notifyFloorPlanAdminJobUpdated,
  requestFloorPlanAdminJobMutation,
  subscribeToFloorPlanAdminJobUpdates,
} from "@/lib/floor-plan-admin-review-events";

type RenderedPage = {
  pageNumber: number;
  widthPx: number;
  heightPx: number;
  assetKey: string;
};

type SupplementarySource = {
  id: string;
  createdAt: string;
  purpose: string;
  renderedPagesJson: unknown;
  attachedToCandidateAt: string | null;
  sourceAsset: {
    id: string;
    fileName: string;
    mimeType: string;
    byteLength: number;
    sha256: string;
    contentDeletedAt: string | null;
  };
};

type JobPayload = {
  id: string;
  status: string;
  candidateVersion: number;
  revision: { id: string } | null;
  supplementarySources: SupplementarySource[];
};

function renderedPages(value: unknown): RenderedPage[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (page): page is RenderedPage =>
      Boolean(page) &&
      typeof page === "object" &&
      Number.isInteger((page as RenderedPage).pageNumber) &&
      Number.isFinite((page as RenderedPage).widthPx) &&
      Number.isFinite((page as RenderedPage).heightPx) &&
      typeof (page as RenderedPage).assetKey === "string"
  );
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export default function SupplementarySourceEvidencePanel({
  jobId,
}: {
  jobId: string;
}) {
  const [job, setJob] = useState<JobPayload | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [selectedPages, setSelectedPages] = useState<Record<string, number>>({});

  const reload = useCallback(async () => {
    const response = await fetch(`/api/admin/floor-plan-imports/${jobId}`, {
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as
      | { job?: JobPayload; error?: string }
      | null;
    if (!response.ok || !payload?.job) {
      throw new Error(payload?.error ?? "Unable to load supplementary evidence");
    }
    setJob(payload.job);
    setFailed(false);
  }, [jobId]);

  useEffect(() => {
    let active = true;
    reload().catch((cause: Error) => {
      if (!active) return;
      setFailed(true);
      setFeedback(cause.message);
    });
    return () => {
      active = false;
    };
  }, [reload]);

  useEffect(
    () =>
      subscribeToFloorPlanAdminJobUpdates(jobId, () => {
        void reload().catch((cause: Error) => setFeedback(cause.message));
      }),
    [jobId, reload]
  );

  const run = async (
    key: string,
    action: () => Promise<void>,
    mutationId?: string
  ) => {
    setPending(key);
    setFeedback(null);
    let committed = false;
    try {
      await action();
      committed = true;
      notifyFloorPlanAdminJobUpdated(jobId, { mutationId });
      await reload();
    } catch (cause) {
      if (mutationId && !committed) {
        cancelFloorPlanAdminJobMutation(jobId, mutationId);
      }
      setFeedback(cause instanceof Error ? cause.message : "Evidence action failed");
    } finally {
      setPending(null);
    }
  };

  if (failed && !job) {
    return (
      <section className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        {feedback ?? "Unable to load supplementary evidence."}
      </section>
    );
  }

  const immutable = Boolean(job?.revision);
  const upload = () =>
    run("upload", async () => {
      if (!file) throw new Error("Choose an official brochure or evidence image first");
      const body = new FormData();
      body.set("file", file);
      const response = await fetch(
        `/api/admin/floor-plan-imports/${jobId}/supplementary-sources`,
        { method: "POST", body }
      );
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok) throw new Error(payload?.error ?? "Unable to upload evidence");
      setFile(null);
      setFeedback("Evidence rendered. Attach it to the candidate before using it in a binding.");
    });

  const attach = (source: SupplementarySource) => {
    if (!job) return;
    const mutationId = requestFloorPlanAdminJobMutation(
      jobId,
      `Attaching ${source.sourceAsset.fileName}`
    );
    if (!mutationId) {
      setFeedback("Attachment cancelled; your unsaved review changes were kept.");
      return;
    }
    void run(`attach:${source.id}`, async () => {
      const response = await fetch(
        `/api/admin/floor-plan-imports/${jobId}/supplementary-sources/${source.id}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ candidateVersion: job.candidateVersion }),
        }
      );
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok) throw new Error(payload?.error ?? "Unable to attach evidence");
      setFeedback("The durable source is now part of the canonical review candidate.");
    }, mutationId);
  };

  const remove = (source: SupplementarySource) => {
    if (!job) return;
    if (!window.confirm(`Remove ${source.sourceAsset.fileName} and its rendered previews?`)) {
      return;
    }
    const mutationId = requestFloorPlanAdminJobMutation(
      jobId,
      `Removing ${source.sourceAsset.fileName}`
    );
    if (!mutationId) {
      setFeedback("Removal cancelled; your unsaved review changes were kept.");
      return;
    }
    void run(`remove:${source.id}`, async () => {
      const response = await fetch(
        `/api/admin/floor-plan-imports/${jobId}/supplementary-sources/${source.id}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ candidateVersion: job.candidateVersion }),
        }
      );
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok) throw new Error(payload?.error ?? "Unable to remove evidence");
      setFeedback("Supplementary evidence removed.");
    }, mutationId);
  };

  return (
    <section className="rounded-xl border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Supplementary source evidence</h2>
          <p className="mt-1 max-w-3xl text-xs text-neutral-600">
            Upload an official block or unit-distribution brochure for address bindings. It
            cannot satisfy the primary plan&apos;s geometry, scale, calibration, or overlay gates.
          </p>
        </div>
        {!immutable ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              accept="application/pdf,image/png,image/jpeg,image/webp,.pdf,.png,.jpg,.jpeg,.webp"
              className="max-w-64 text-xs"
              disabled={Boolean(pending)}
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              type="file"
            />
            <button
              className="rounded-lg bg-black px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
              disabled={!file || Boolean(pending)}
              onClick={upload}
              type="button"
            >
              {pending === "upload" ? "Rendering…" : "Upload evidence"}
            </button>
          </div>
        ) : (
          <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs">Immutable</span>
        )}
      </div>
      {feedback ? <div className="mt-3 rounded-lg border bg-neutral-50 p-2 text-xs">{feedback}</div> : null}
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(job?.supplementarySources ?? []).map((source) => {
          const pages = renderedPages(source.renderedPagesJson);
          const preview =
            pages.find((page) => page.pageNumber === selectedPages[source.id]) ??
            pages[0];
          return (
            <article className="overflow-hidden rounded-lg border" key={source.id}>
              {preview ? (
                <div
                  className="relative w-full bg-neutral-100"
                  style={{ aspectRatio: `${preview.widthPx} / ${preview.heightPx}` }}
                >
                  <Image
                    alt={`Evidence preview: ${source.sourceAsset.fileName}`}
                    className="object-contain"
                    fill
                    sizes="(max-width: 768px) 100vw, 33vw"
                    src={`/api/admin/floor-plan-imports/${jobId}/assets/${preview.assetKey}`}
                    unoptimized
                  />
                </div>
              ) : null}
              <div className="p-3">
                <div className="truncate text-sm font-medium">{source.sourceAsset.fileName}</div>
                <div className="mt-1 text-xs text-neutral-500">
                  {source.sourceAsset.mimeType} · {formatBytes(source.sourceAsset.byteLength)} · {pages.length} page{pages.length === 1 ? "" : "s"}
                </div>
                <div className="mt-1 break-all font-mono text-[10px] text-neutral-500">
                  Source ID {source.sourceAsset.id} · SHA-256 {source.sourceAsset.sha256}
                </div>
                {pages.length > 1 ? (
                  <div className="mt-2 flex max-h-24 flex-wrap gap-1 overflow-auto">
                    {pages.map((page) => (
                      <button
                        className={`rounded border px-1.5 py-1 text-[10px] ${
                          preview?.pageNumber === page.pageNumber
                            ? "border-blue-600 bg-blue-50 text-blue-700"
                            : ""
                        }`}
                        key={page.pageNumber}
                        onClick={() =>
                          setSelectedPages((current) => ({
                            ...current,
                            [source.id]: page.pageNumber,
                          }))
                        }
                        type="button"
                      >
                        Page {page.pageNumber}
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    className="rounded border px-2 py-1 text-xs font-medium"
                    href={`/api/admin/floor-plan-imports/${jobId}/assets/${source.sourceAsset.id}`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open source
                  </a>
                  <button
                    className="rounded border px-2 py-1 text-xs font-medium disabled:opacity-40"
                    disabled={immutable || Boolean(source.attachedToCandidateAt) || Boolean(pending)}
                    onClick={() => attach(source)}
                    type="button"
                  >
                    {source.attachedToCandidateAt ? "Attached to candidate" : "Attach to candidate"}
                  </button>
                  <button
                    className="rounded border border-red-200 px-2 py-1 text-xs font-medium text-red-700 disabled:opacity-40"
                    disabled={immutable || Boolean(pending)}
                    onClick={() => remove(source)}
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </article>
          );
        })}
        {!job?.supplementarySources.length ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-neutral-500">
            No independent brochure or address evidence attached.
          </div>
        ) : null}
      </div>
    </section>
  );
}
