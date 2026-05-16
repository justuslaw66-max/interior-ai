"use client";

import Link from "next/link";
import { track } from "@/lib/analytics";
import DuplicateDesignButton from "@/components/DuplicateDesignButton";

export function ShareFooterCTA({ shareToken }: { shareToken?: string }) {
  return (
    <footer className="mx-auto max-w-6xl px-6 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3 shadow">
        <div className="text-xs text-neutral-500">Made with Interior AI (beta)</div>
        <div className="flex items-center gap-2">
          {shareToken ? (
            <DuplicateDesignButton
              shareToken={shareToken}
              className="rounded-lg bg-neutral-900 px-3 py-2 text-sm text-white disabled:opacity-70"
            >
              Duplicate this design
            </DuplicateDesignButton>
          ) : null}
          <Link
            href="/?source=share"
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 hover:bg-neutral-50"
            onClick={() => track("share_cta_clicked", { source: "share_page" })}
          >
            Create your own room
          </Link>
        </div>
      </div>
    </footer>
  );
}
