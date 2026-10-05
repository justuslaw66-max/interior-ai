"use client";

import Link from "next/link";
import { track } from "@/lib/analytics";

/** The plans, schedules and files for the rooms: the export page (UX audit SX7, phase 4e). */
export function ShareExportPackLink({ shareToken }: { shareToken: string }) {
  return (
    <Link
      href={`/share/${shareToken}/export`}
      data-testid="share-export-pack"
      data-share-touch-target="true"
      onClick={() => track("share_page_export_clicked", { shared_context: true })}
      className="inline-flex min-h-11 items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-neutral-900 outline-offset-2 hover:bg-neutral-50 focus-visible:outline-2"
    >
      Plans and schedules
    </Link>
  );
}
