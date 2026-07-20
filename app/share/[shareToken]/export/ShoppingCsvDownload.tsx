"use client";

import { useMemo, useState } from "react";
import { track } from "@/lib/analytics";
import type { ShoppingCsvRow } from "@/lib/share-shopping-csv";

export type { ShoppingCsvRow } from "@/lib/share-shopping-csv";

function escapeCsvCell(value: string | number | boolean | null) {
  const text = value === null ? "" : String(value);
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function buildCsv(rows: ShoppingCsvRow[]) {
  const roomSubtotals = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.roomName] = (acc[row.roomName] ?? 0) + row.lineTotalUsd;
    return acc;
  }, {});
  const headers = [
    "Room",
    "Category",
    "Item",
    "Product ID",
    "Variant ID",
    "Variant",
    "Purchase option",
    "Qty",
    "Status",
    "Source",
    "Retailer URL",
    "Include in checkout",
    "Unit price USD",
    "Line total USD",
    "Room subtotal USD",
    "Review note",
  ];
  const body = rows.map((row) => [
    row.roomName,
    row.category,
    row.itemTitle,
    row.productId,
    row.variantId,
    row.variantLabel,
    row.purchaseOptionLabel,
    row.quantity,
    row.status,
    row.source,
    row.retailerUrl,
    row.includeInCheckout ? "Yes" : "No",
    row.unitPriceUsd.toFixed(2),
    row.lineTotalUsd.toFixed(2),
    (roomSubtotals[row.roomName] ?? row.lineTotalUsd).toFixed(2),
    row.reviewNote,
  ]);

  return [headers, ...body].map((cells) => cells.map(escapeCsvCell).join(",")).join("\n");
}

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "interior-ai-shopping-list";
}

export default function ShoppingCsvDownload({
  rows,
  title,
  shareToken,
}: {
  rows: ShoppingCsvRow[];
  title: string;
  shareToken: string;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const csv = useMemo(() => buildCsv(rows), [rows]);
  const filename = `${slugify(title)}-shopping-list.csv`;
  const disabled = rows.length === 0;

  const handleDownload = () => {
    if (disabled) return;

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    track("share_export_shopping_csv_downloaded", {
      shared_context: Boolean(shareToken),
      row_count: rows.length,
    });
    setMessage("Shopping CSV downloaded.");
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        data-testid="share-export-shopping-csv-download"
        onClick={handleDownload}
        disabled={disabled}
        className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-neutral-900 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Download shopping CSV
      </button>
      {message ? (
        <div className="text-xs text-neutral-500" role="status">
          {message}
        </div>
      ) : null}
    </div>
  );
}
