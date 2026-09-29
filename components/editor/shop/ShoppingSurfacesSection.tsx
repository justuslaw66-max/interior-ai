"use client";

import LazyImage from "@/components/common/LazyImage";
import type { ShoppingSurface } from "@/lib/shopping-surfaces";

/**
 * The design's floor and wall finishes, as in the Shop mockup: one row per material with its
 * supplier, where it goes and how much to order (10% extra for cuts). Suppliers price them, so
 * they stay out of the total and have no Buy.
 */
export function ShoppingSurfacesSection({ surfaces }: { surfaces: readonly ShoppingSurface[] }) {
  if (!surfaces.length) return null;
  return (
    <section
      aria-labelledby="shopping-section-surfaces"
      data-testid="shopping-surfaces"
      className="overflow-hidden rounded-2xl border border-neutral-200 bg-white"
    >
      <div className="flex min-h-12 items-center justify-between gap-3 border-b border-neutral-200 px-3.5 py-2.5 md:min-h-14 md:px-5">
        <h2 id="shopping-section-surfaces" className="text-[15px] font-bold text-neutral-900 md:text-base">
          Surfaces
        </h2>
        <span className="shrink-0 text-[13px] text-neutral-600">Priced by the supplier</span>
      </div>
      <ul className="m-0 list-none p-0">
        {surfaces.map((surface) => (
          <li
            key={surface.materialId}
            data-testid="shopping-surface-row"
            data-material-id={surface.materialId}
            className="flex items-center gap-3 border-b border-neutral-100 py-2.5 pl-3.5 pr-3.5 last:border-b-0 md:gap-4 md:pl-5 md:pr-5"
          >
            <div className="relative h-[42px] w-14 shrink-0 overflow-hidden rounded-lg bg-[#f4f1eb] md:h-[54px] md:w-[72px]">
              {surface.swatchUrl ? <LazyImage src={surface.swatchUrl} alt="" className="h-full w-full" /> : null}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold text-neutral-900 md:text-[15px]" title={surface.name}>
                {surface.name}
              </div>
              <div className="mt-0.5 text-xs text-neutral-600 md:text-[13px]">
                {surface.supplier} · {surface.where}
              </div>
              <div data-testid="shopping-surface-order" className="mt-0.5 text-xs text-neutral-700 md:text-[13px]">
                Order about {surface.orderAreaSqm} m², including 10% extra for cuts
              </div>
            </div>
            {/* Phones have the section's "Priced by the supplier" and the room for the text. */}
            <span data-testid="shopping-surface-price" className="hidden shrink-0 text-[13px] text-neutral-600 md:block">
              Price on request
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
