"use client";

import { useMemo, useState } from "react";
import { track } from "@/lib/analytics";

export type BetaFeedbackContext = {
  designId?: string | null;
  shareToken?: string | null;
  mode: string;
  viewMode: string;
  plan: string;
  activeRoomName: string;
  roomCount: number;
  itemCount: number;
  openingCount: number;
  exportReadinessScore: number;
  viewportWidth: number;
  viewportHeight: number;
};

type BetaFeedbackWidgetProps = {
  context: BetaFeedbackContext;
};

function buildFeedbackPayload(note: string, context: BetaFeedbackContext) {
  const page =
    typeof window === "undefined"
      ? ""
      : `${window.location.pathname}${window.location.search}`;

  return {
    note,
    context,
    page,
    userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
    sentAt: new Date().toISOString(),
  };
}

export default function BetaFeedbackWidget({ context }: BetaFeedbackWidgetProps) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "failed" | "copied">("idle");

  const contextSummary = useMemo(
    () =>
      [
        context.activeRoomName,
        context.viewMode,
        `${context.roomCount} rooms`,
        `${context.itemCount} items`,
        `${context.openingCount} openings`,
        `${context.exportReadinessScore}% export`,
      ].join(" / "),
    [context]
  );

  const resetAndClose = () => {
    setOpen(false);
    setStatus("idle");
    setNote("");
  };

  const copyReport = async () => {
    const payload = buildFeedbackPayload(note.trim(), context);
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  };

  const submitFeedback = async () => {
    const trimmed = note.trim();
    if (!trimmed) return;

    const payload = buildFeedbackPayload(trimmed.slice(0, 1200), context);
    setStatus("sending");
    track("beta_feedback_submitted", {
      design_id: context.designId ?? null,
      view_mode: context.viewMode,
      room_count: context.roomCount,
      item_count: context.itemCount,
      opening_count: context.openingCount,
      export_readiness_score: context.exportReadinessScore,
    });

    try {
      const response = await fetch("/api/track/app-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType: "beta_feedback_submitted",
          designId: context.designId ?? null,
          shareToken: context.shareToken ?? null,
          meta: payload,
        }),
      });

      if (!response.ok) throw new Error("Feedback request failed");
      setStatus("sent");
      window.setTimeout(resetAndClose, 900);
    } catch {
      setStatus("failed");
    }
  };

  return (
    <>
      <button
        type="button"
        data-testid="beta-feedback-open"
        className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] left-4 z-40 rounded-full border border-neutral-200 bg-white/95 px-3 py-2 text-xs font-semibold text-neutral-800 shadow-xl backdrop-blur hover:bg-neutral-50 md:bottom-24"
        onClick={() => {
          setOpen(true);
          setStatus("idle");
        }}
      >
        Feedback
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/30 px-4 backdrop-blur-[1px]"
          data-testid="beta-feedback-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="Send beta feedback"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) resetAndClose();
          }}
        >
          <div className="w-[min(420px,calc(100vw-2rem))] rounded-xl border border-neutral-200 bg-white p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-neutral-950">Beta feedback</h3>
                <p className="mt-0.5 truncate text-xs text-neutral-500">{contextSummary}</p>
              </div>
              <button
                type="button"
                className="rounded-md px-2 py-1 text-sm font-semibold text-neutral-500 hover:bg-neutral-100"
                aria-label="Close feedback dialog"
                onClick={resetAndClose}
              >
                x
              </button>
            </div>

            <label className="mt-3 block">
              <span className="text-xs font-semibold text-neutral-700">What felt confusing?</span>
              <textarea
                data-testid="beta-feedback-note"
                className="mt-1 min-h-28 w-full resize-none rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                value={note}
                maxLength={1200}
                autoFocus
                onChange={(event) => {
                  setNote(event.currentTarget.value);
                  if (status !== "idle") setStatus("idle");
                }}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                    void submitFeedback();
                  }
                  if (event.key === "Escape") resetAndClose();
                }}
              />
            </label>

            <div className="mt-3 min-h-5 text-xs text-neutral-500" role="status">
              {status === "sent" && "Sent. Thank you."}
              {status === "failed" && "Could not send. Copy the report instead."}
              {status === "copied" && "Copied."}
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <button
                type="button"
                className="rounded-lg border border-neutral-200 px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
                onClick={copyReport}
              >
                Copy
              </button>
              <button
                type="button"
                className="rounded-lg border border-neutral-200 px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
                onClick={resetAndClose}
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="beta-feedback-submit"
                className="rounded-lg bg-neutral-950 px-3 py-2 text-sm font-semibold text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
                disabled={!note.trim() || status === "sending"}
                onClick={submitFeedback}
              >
                {status === "sending" ? "Sending" : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
