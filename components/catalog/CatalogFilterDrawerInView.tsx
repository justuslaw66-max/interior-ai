"use client";

import { useEffect, useRef, type ComponentProps } from "react";
import CatalogFilterDrawer from "./CatalogFilterDrawer";

/**
 * Furnish puts the catalogue first (UX audit FU1), so the filter drawer opens partway down the
 * panel, and on a short screen its foot can be below the fold. Opening it scrolls the panel just
 * enough to show the whole drawer.
 */
export default function CatalogFilterDrawerInView(props: ComponentProps<typeof CatalogFilterDrawer>) {
  const holderRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (props.open) holderRef.current?.firstElementChild?.scrollIntoView({ block: "nearest" });
  }, [props.open]);
  return (
    <div ref={holderRef} data-testid="catalog-filter-drawer-holder">
      <CatalogFilterDrawer {...props} />
    </div>
  );
}
