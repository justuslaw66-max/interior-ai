"use client";

import { useEffect, useState } from "react";

export default function ModelDownloadCell({ modelUrl }: { modelUrl: string }) {
  const [status, setStatus] = useState<"idle" | "ok" | "missing" | "error">("idle");

  useEffect(() => {
    fetch(modelUrl, { method: "HEAD" })
      .then((r) => setStatus(r.ok ? "ok" : "missing"))
      .catch(() => setStatus("error"));
  }, [modelUrl]);

  if (status === "ok")
    return <span className="text-green-600 text-xs font-bold">✓ Available</span>;
  if (status === "missing")
    return <span className="text-red-600 text-xs font-bold">✗ Missing</span>;
  if (status === "error")
    return <span className="text-red-600 text-xs font-bold">✗ Error</span>;

  return (
    <a
      href={modelUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-block px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600"
    >
      Download
    </a>
  );
}
