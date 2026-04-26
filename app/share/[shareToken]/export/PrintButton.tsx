"use client";

import type { ExportCapabilities } from "@/lib/export-capabilities";
import { PDFDownloadButton } from "@/components/PDFDownloadButton";

export default function PrintButton({
  shareToken,
  designId,
  capabilities,
}: {
  shareToken: string;
  designId?: string | null;
  capabilities: ExportCapabilities;
}) {
  return <PDFDownloadButton capabilities={capabilities} shareToken={shareToken} designId={designId ?? null} />;
}
