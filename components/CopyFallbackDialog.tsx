"use client";

import { useEffect, useId, useRef } from "react";

type CopyFallbackDialogProps = {
  open: boolean;
  title: string;
  description: string;
  value: string;
  onClose: () => void;
};

export default function CopyFallbackDialog({
  open,
  title,
  description,
  value,
  onClose,
}: CopyFallbackDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-5 shadow-2xl">
        <div id={titleId} className="text-lg font-semibold text-neutral-950">
          {title}
        </div>
        <div id={descriptionId} className="mt-2 text-sm leading-6 text-neutral-600">
          {description}
        </div>
        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Copy manually
        </label>
        <input
          ref={inputRef}
          readOnly
          value={value}
          className="mt-1 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-500"
          data-testid="copy-fallback-value"
          onFocus={(event) => event.currentTarget.select()}
        />
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-semibold text-white hover:bg-neutral-800"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
