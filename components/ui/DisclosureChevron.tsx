import { ChevronDown, ChevronRight } from "lucide-react";

/**
 * A show/hide section's chevron: right while it's closed, down while it's open, as in the floors
 * list (30 Oct 2026; these toggles showed − and +). The button's words and aria-expanded say what
 * it does, so the icon is hidden from readers.
 */
export function DisclosureChevron({ open, className = "" }: { open: boolean; className?: string }) {
  const Icon = open ? ChevronDown : ChevronRight;
  return <Icon className={`h-4 w-4 shrink-0 ${className}`.trim()} aria-hidden="true" />;
}
