"use client";

import { useState } from "react";

export default function RefreshPlanButton() {
  const [isChecking, setIsChecking] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);

  const refreshPlanNow = async () => {
    setIsChecking(true);
    setStatusText(null);
    try {
      const res = await fetch("/api/me", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (data?.plan === "pro") {
        setStatusText("Pro is active. Redirecting…");
        window.location.href = "/?mode=designer";
        return;
      }
      setStatusText("Still syncing. Try again in a few seconds.");
    } catch {
      setStatusText("Could not refresh right now. Please try again.");
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => {
          void refreshPlanNow();
        }}
        disabled={isChecking}
        className="w-full rounded-xl border px-4 py-2 text-center text-sm disabled:opacity-60"
      >
        {isChecking ? "Checking plan..." : "Refresh plan now"}
      </button>
      {statusText && <p className="mt-2 text-xs text-neutral-500">{statusText}</p>}
    </div>
  );
}
