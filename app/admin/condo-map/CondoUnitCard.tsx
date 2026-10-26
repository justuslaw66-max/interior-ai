import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { condoMapFileUrl, type CondoUnitCard as CondoUnit } from "@/lib/condo-map/condo-map-data";
import { unitArea, unitFloorName, unitLayout } from "./condo-map-view";

/** The chosen unit: its type, floor and stack, its layout and areas as the brochure gives them, and its plan. */
export function CondoUnitCard({ slug, unit, onClose }: { slug: string; unit: CondoUnit; onClose: () => void }) {
  const where = [unit.type ? `Type ${unit.type}` : null, unitFloorName(unit), unit.stack ? `stack ${unit.stack}` : null];
  return (
    <section aria-labelledby="condo-map-unit" className="rounded-xl border border-separator bg-surface-elevated p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 id="condo-map-unit" className="text-base font-semibold text-label">
            {unit.unit}
          </h2>
          <p className="text-xs text-label-secondary">{where.filter(Boolean).join(" · ")}</p>
        </div>
        <Button variant="quiet" size="compact" onClick={onClose}>
          Close
        </Button>
      </div>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm text-label">
        <dt className="text-label-secondary">Layout</dt>
        <dd>{unitLayout(unit)}</dd>
        <dt className="text-label-secondary">Area</dt>
        <dd>{unitArea(unit)}</dd>
        {unit.balconyM2 !== null ? (
          <>
            <dt className="text-label-secondary">Balcony</dt>
            <dd>{unit.balconyM2.toLocaleString("en-SG")} m²</dd>
          </>
        ) : null}
      </dl>
      {unit.plan ? (
        <div className="relative mt-3 aspect-square w-full overflow-hidden rounded-lg border border-separator bg-surface">
          <Image
            alt={unit.type ? `Plan of type ${unit.type}` : `Plan of ${unit.unit}`}
            className="object-contain"
            fill
            sizes="300px"
            src={condoMapFileUrl(slug, "plans", unit.plan)}
            unoptimized
          />
        </div>
      ) : (
        <p className="mt-3 text-xs text-label-secondary">There is no plan picture for this unit.</p>
      )}
    </section>
  );
}
