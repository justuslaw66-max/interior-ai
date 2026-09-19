import type { SurfaceMaterialBomWarning } from "@/lib/surface-material-bom-result";

export function SurfaceMaterialBomWarnings({
  warnings,
}: {
  warnings: readonly SurfaceMaterialBomWarning[];
}) {
  if (!warnings.length) return null;
  return (
    <div
      data-testid="surface-material-bom-opening-warning"
      className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
    >
      <div className="font-semibold">Wall quantities need opening review</div>
      {warnings.map((warning) => (
        <div key={warning.openingId} className="mt-1">
          Opening {warning.openingId}: {warning.message}
        </div>
      ))}
    </div>
  );
}
