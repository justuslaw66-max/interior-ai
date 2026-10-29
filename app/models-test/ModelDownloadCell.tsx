"use client";

import { useEffect, useState } from "react";
import { buttonClassName } from "@/components/ui/Button";

export default function ModelDownloadCell({ modelUrl }: { modelUrl: string }) {
  const [status, setStatus] = useState<"idle" | "ok" | "missing" | "error">("idle");

  useEffect(() => {
    fetch(modelUrl, { method: "HEAD" })
      .then((r) => setStatus(r.ok ? "ok" : "missing"))
      .catch(() => setStatus("error"));
  }, [modelUrl]);

  if (status === "ok")
    return <span className="text-on-success-tint text-xs font-bold">✓ Available</span>;
  if (status === "missing")
    return <span className="text-on-danger-tint text-xs font-bold">✗ Missing</span>;
  if (status === "error")
    return <span className="text-on-danger-tint text-xs font-bold">✗ Error</span>;

  return (
    <a
      href={modelUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={buttonClassName({ variant: "primary", size: "compact" })}
    >
      Download
    </a>
  );
}
