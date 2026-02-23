"use client";

import Link from "next/link";
import { track } from "@/lib/analytics";

export function ShareFooterCTA() {
  return (
    <footer className="mx-auto max-w-6xl px-6 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3 shadow">
        <div className="text-xs text-neutral-500">Made with Interior AI (beta)</div>
        <Link
          href="/?source=share"
          className="rounded-lg bg-neutral-900 px-3 py-2 text-sm text-white"
          onClick={() => track("share_cta_clicked", { source: "share_page" })}
        >
          Create your own room
        </Link>
      </div>
    </footer>
  );
}
