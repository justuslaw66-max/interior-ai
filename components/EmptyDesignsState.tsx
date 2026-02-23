"use client";

import Link from "next/link";
import { track } from "@/lib/analytics";

export default function EmptyDesignsState() {
  return (
    <div className="rounded-2xl border bg-white p-6 shadow">
      <div className="text-lg font-semibold">Start with a living room</div>
      <div className="mt-1 text-sm text-neutral-600">
        You can edit everything later.
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link
          href="/?source=template"
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white"
          onClick={() =>
            track("empty_state_clicked", {
              location: "my_designs",
              choice: "template",
            })
          }
        >
          Start from template
        </Link>
        <Link
          href="/?source=blank"
          className="rounded-lg border px-4 py-2 text-sm text-neutral-800"
          onClick={() =>
            track("empty_state_clicked", {
              location: "my_designs",
              choice: "blank",
            })
          }
        >
          Blank room
        </Link>
      </div>
    </div>
  );
}
