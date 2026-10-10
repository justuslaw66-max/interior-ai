"use client";

import { track } from "@/lib/analytics";
import { buttonClassName } from "@/components/ui/Button";

/**
 * The export page's one Download PDF (UX audit SX8, phase 4e): the server's PDF, watermarked when
 * the design's owner is on Free. Viewers can't remove the owner's watermark, so there's no upgrade
 * or pricing here; the note says what the PDF carries.
 */
export function PdfDownloadLink({
  shareToken,
  designId,
  watermarked,
}: {
  shareToken: string;
  designId: string;
  watermarked: boolean;
}) {
  const recordClick = () => {
    track("export_pdf_clicked", { design_id: designId, shared_context: true });
    fetch("/api/track/app-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventType: "export_pdf_clicked", designId, shareToken }),
    }).catch(() => undefined);
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <a
        href={`/share/${shareToken}/export/pdf`}
        data-testid="share-export-pdf-download"
        onClick={recordClick}
        className={buttonClassName({ variant: "primary" })}
      >
        Download PDF
      </a>
      {watermarked ? (
        <p data-testid="share-export-pdf-watermark-note" className="text-xs text-neutral-600">
          Includes an Interior AI watermark.
        </p>
      ) : null}
    </div>
  );
}
