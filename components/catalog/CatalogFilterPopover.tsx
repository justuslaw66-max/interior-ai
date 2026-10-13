"use client";

import { useEffect, useRef, type ComponentProps, type KeyboardEvent } from "react";
import CatalogFilterDrawer from "./CatalogFilterDrawer";
import { CATALOG_FILTERS_TOGGLE_ID } from "./CatalogFiltersBar";

/**
 * Structured filters, a non-modal popover under Filters (UX AX5). Opening it moves focus into it
 * and scrolls the panel just enough to show all of it: Furnish puts the catalogue first (UX audit
 * FU1), so it opens partway down the panel, and on a short screen its foot can be below the fold.
 * Escape and Close shut it and return focus to Filters. The catalogue around it stays usable.
 */
export default function CatalogFilterPopover({
  onClose,
  ...props
}: ComponentProps<typeof CatalogFilterDrawer>) {
  const holderRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const popover = props.open ? holderRef.current?.firstElementChild : null;
    if (!(popover instanceof HTMLElement)) return;
    popover.scrollIntoView({ block: "nearest" });
    popover.focus({ preventScroll: true });
  }, [props.open]);

  const close = () => {
    onClose();
    document.getElementById(CATALOG_FILTERS_TOGGLE_ID)?.focus();
  };
  const closeOnEscape = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape" || !props.open) return;
    event.preventDefault();
    event.stopPropagation();
    close();
  };

  return (
    <div ref={holderRef} data-testid="catalog-filter-drawer-holder" onKeyDown={closeOnEscape}>
      <CatalogFilterDrawer {...props} onClose={close} />
    </div>
  );
}
