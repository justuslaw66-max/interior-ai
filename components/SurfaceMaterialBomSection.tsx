import type { SurfaceMaterialBomRow } from "@/lib/surface-material-bom";
import type { SurfaceMaterialBomWarning } from "@/lib/surface-material-bom-result";
import { SurfaceMaterialBomWarnings } from "@/components/SurfaceMaterialBomWarnings";

function money(currency: string | null, value: number | null) {
  if (value === null) return "Quote";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency ?? "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatArea(value: number) {
  return `${value.toFixed(1).replace(/\.0$/, "")} m2`;
}

function BomRow({ row }: { row: SurfaceMaterialBomRow }) {
  return (
    <tr className="border-b align-top">
      <td className="p-2">{row.roomName}</td>
      <td className="p-2">
        <div className="font-medium">{row.materialName}</div>
        <div className="text-xs text-gray-500">{row.surfaceLabel} · {row.materialId}</div>
        <div className="mt-1 text-xs text-gray-500">
          Pattern {row.pattern.replace(/_/g, " ")} · Rotation {row.rotationDeg}° · Scale {row.scale.toFixed(2)}x · Joint {row.jointSizeMm} mm
        </div>
        {row.sampleRequestUrl ? (
          <a href={row.sampleRequestUrl} className="mt-1 inline-block text-xs font-semibold text-blue-700" target="_blank" rel="noreferrer">
            Request sample / quote
          </a>
        ) : null}
      </td>
      <td className="p-2">{row.supplier}</td>
      <td className="p-2">{row.materialFamily.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())}</td>
      <td className="p-2 text-right">{formatArea(row.surfaceAreaSqm)}</td>
      <td className="p-2 text-right">
        <div>{formatArea(row.orderAreaSqm)}</div>
        <div className="text-xs text-gray-500">incl. {(row.wasteFactor * 100).toFixed(0)}% waste</div>
      </td>
      <td className="p-2 text-right">{money(row.pricePerSqmCurrency, row.pricePerSqmAmount)}</td>
      <td className="p-2 text-right">{money(row.pricePerSqmCurrency, row.lineTotal)}</td>
      <td className="p-2">
        <div className={row.status === "published" ? "text-green-700" : "text-amber-700"}>{row.status.replace(/_/g, " ")}</div>
        <div className="mt-1 text-xs text-gray-500">{row.purchaseMode.replace(/_/g, " ")}</div>
        {row.reviewNote ? <div className="mt-1 text-xs text-amber-700">{row.reviewNote}</div> : null}
      </td>
    </tr>
  );
}

function BomTable({ rows }: { rows: readonly SurfaceMaterialBomRow[] }) {
  if (!rows.length) return null;
  const headings = ["Room", "Surface / Material", "Supplier", "Family", "Surface area", "Order area", "Price / m2", "Estimate", "Status"];
  const numericHeadings = ["Surface area", "Order area", "Price / m2", "Estimate"];
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full border-collapse text-sm">
        <thead><tr className="border-b bg-gray-50 text-left">
          {headings.map((heading) => <th key={heading} className={numericHeadings.includes(heading) ? "p-2 text-right" : "p-2"}>{heading}</th>)}
        </tr></thead>
        <tbody>{rows.map((row) => <BomRow key={`${row.roomId}-${row.surface}-${row.materialId}`} row={row} />)}</tbody>
      </table>
    </div>
  );
}

export function SurfaceMaterialBomSection({
  rows,
  warnings,
}: {
  rows: readonly SurfaceMaterialBomRow[];
  warnings: readonly SurfaceMaterialBomWarning[];
}) {
  if (!rows.length && !warnings.length) return null;
  return (
    <div className="mb-12">
      <h2 className="mb-4 text-2xl font-bold text-gray-900">Surface Material BOM</h2>
      <p className="mb-3 text-sm text-gray-600">
        Area-based floor and wall finishes with a suggested 10% waste allowance. Quote/sample materials are not furniture cart lines.
      </p>
      <SurfaceMaterialBomWarnings warnings={warnings} />
      <BomTable rows={rows} />
    </div>
  );
}
