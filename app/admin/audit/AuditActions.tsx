"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AuditActions() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => {
          setRefreshing(true);
          router.refresh();
          // Keep feedback visible briefly so users notice a refresh happened.
          setTimeout(() => setRefreshing(false), 700);
        }}
        className="rounded-md border px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
      >
        {refreshing ? "Refreshing..." : "Refresh"}
      </button>
      <Link
        href="/api/admin/audit?download=1"
        className="rounded-md border px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
      >
        Download JSON
      </Link>
      <Link
        href="/api/admin/catalog/media-health"
        className="rounded-md border px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
      >
        Media health JSON
      </Link>
    </div>
  );
}