"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, buttonClassName } from "@/components/ui/Button";

export default function AuditActions() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        onClick={() => {
          setRefreshing(true);
          router.refresh();
          // Keep feedback visible briefly so users notice a refresh happened.
          setTimeout(() => setRefreshing(false), 700);
        }}
        size="compact"
      >
        {refreshing ? "Refreshing..." : "Refresh"}
      </Button>
      <Link
        href="/api/admin/audit?download=1"
        className={buttonClassName({ size: "compact" })}
      >
        Download JSON
      </Link>
      <Link
        href="/api/admin/catalog/media-health"
        className={buttonClassName({ size: "compact" })}
      >
        Media health JSON
      </Link>
    </div>
  );
}