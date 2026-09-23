import type { VerificationTier } from "./floorPlanReviewTypes";

export function ConstructionEvidenceEditor({
  evidenceText,
  onEvidenceTextChange,
  onVerificationTierChange,
  verificationTier,
}: {
  evidenceText: string;
  onEvidenceTextChange: (value: string) => void;
  onVerificationTierChange: (value: VerificationTier) => void;
  verificationTier: VerificationTier;
}) {
  return (
    <>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="text-xs font-medium text-neutral-700">
          Verification tier
          <select
            className="mt-1 w-full rounded-lg border p-2 text-sm"
            onChange={(event) =>
              onVerificationTierChange(event.target.value as VerificationTier)
            }
            value={verificationTier}
          >
            <option value="source_verified">Source verified</option>
            <option value="construction_verified">Construction verified</option>
          </select>
        </label>
      </div>
      {verificationTier === "construction_verified" ? (
        <label className="mt-4 block text-xs font-medium text-neutral-700">
          Unit-specific as-built / measurement evidence JSON
          <span className="mt-1 block font-normal leading-4 text-amber-700">
            Upload and authorize a unit-specific construction source first. Every
            geometry ID must then have direct provenance to that exact source or
            an exact coordinate signature; widths, thicknesses, dimensions, and
            vertical claims require exact scalar evidence. IDs are never
            pre-confirmed by the editor.
          </span>
          <textarea
            className="mt-2 min-h-52 w-full rounded-lg border p-2 font-mono text-xs"
            onChange={(event) => onEvidenceTextChange(event.target.value)}
            value={evidenceText}
          />
        </label>
      ) : null}
    </>
  );
}
