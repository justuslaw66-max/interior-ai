import type { FloorPlanCatalogSearchResult } from "@/lib/floor-plan-catalog-repository";
import Image from "next/image";
const ORIENTATION_LABELS = {
  normal: "Source orientation", mirror_x: "Mirrored left to right", mirror_z: "Mirrored top to bottom",
  rotate_90: "Rotated 90°", rotate_180: "Rotated 180°", rotate_270: "Rotated 270°",
  mirror_x_rotate_90: "Mirrored left to right, then rotated 90°",
  mirror_x_rotate_270: "Mirrored left to right, then rotated 270°",
};

export default function FloorPlanSelectionContext({ result, subtle }: { result: FloorPlanCatalogSearchResult; subtle: string }) {
  return <div data-testid="floor-plan-orientation" className={`mt-1 text-[11px] ${subtle}`}>
    {floorPlanOrientationLabel(result)}
    {result.previewUrl ? " Preview shows the published source page." : " Source preview unavailable."}
    <div>{result.verificationTier === "construction_verified" ? "Construction verified" : "Source verified"}</div>
    {result.previewUrl ? <Image src={result.previewUrl} alt={`${result.label} selected source floor plan`} width={1200} height={800} className="h-40 w-full object-contain" /> : null}
    {result.sourceUrl && result.sourcePage !== null ? <a href={`${result.sourceUrl.split("#")[0]}#page=${result.sourcePage}`} target="_blank" rel="noreferrer">Selected source page {result.sourcePage}</a> : null}
  </div>;
}


export function floorPlanOrientationLabel(result: FloorPlanCatalogSearchResult) {
  return result.matchLevel === "unit" && result.addressTransform
    ? `Applied orientation: ${ORIENTATION_LABELS[result.addressTransform]}.`
    : "Unit orientation is not established by catalogue selection.";
}
