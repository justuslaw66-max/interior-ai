"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function AdminFloorPlanIntakeForm() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setFeedback("Select a PDF, image, ASCII DXF, IFC STEP, or DWG floor plan first.");
      return;
    }
    setPending(true);
    setFeedback("Hashing and storing the source…");
    let jobId = "";
    try {
      const body = new FormData();
      body.set("file", file);
      const createdResponse = await fetch("/api/floor-plan-imports", {
        method: "POST",
        body,
      });
      const created = (await createdResponse.json().catch(() => null)) as
        | { job?: { id: string }; next?: { processUrl?: string }; error?: string }
        | null;
      if (!createdResponse.ok || !created?.job?.id) {
        throw new Error(created?.error ?? "Unable to create the import job");
      }
      jobId = created.job.id;
      setFeedback("Rendering and extracting the source…");
      const processedResponse = await fetch(
        created.next?.processUrl ?? `/api/floor-plan-imports/${jobId}/process`,
        { method: "POST" }
      );
      const processed = (await processedResponse.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!processedResponse.ok) {
        throw new Error(processed?.error ?? "The import job was created but processing failed");
      }
      router.push(`/admin/floor-plans/${jobId}`);
      router.refresh();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Unable to import the floor plan");
      if (jobId) {
        window.setTimeout(() => router.push(`/admin/floor-plans/${jobId}`), 1200);
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <form className="rounded-xl border border-blue-200 bg-blue-50 p-4" onSubmit={submit}>
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-64 flex-1 text-xs font-medium text-blue-950">
          Start an admin-assisted import
          <input
            accept="application/pdf,image/png,image/jpeg,image/webp,application/dxf,application/x-dxf,image/vnd.dxf,application/ifc,application/x-ifc,application/step,application/x-step,application/dwg,application/x-dwg,image/vnd.dwg,.pdf,.png,.jpg,.jpeg,.webp,.dxf,.ifc,.ifcstep,.step,.stp,.dwg"
            className="mt-1 block w-full rounded-lg border border-blue-200 bg-white p-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-blue-700 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white"
            disabled={pending}
            ref={fileRef}
            type="file"
          />
        </label>
        <button
          className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          disabled={pending}
          type="submit"
        >
          {pending ? "Processing…" : "Upload and detect"}
        </button>
      </div>
      <p className="mt-2 text-xs text-blue-900">
        Uses the same private, owner-scoped source store and detection pipeline as consumer uploads.
        Weak extraction remains underlay-only and cannot be published without review.
      </p>
      {feedback ? <div className="mt-2 text-xs font-medium text-blue-950" role="status">{feedback}</div> : null}
    </form>
  );
}
