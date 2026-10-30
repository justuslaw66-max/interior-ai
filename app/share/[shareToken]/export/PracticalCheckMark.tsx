import { Check, Info, TriangleAlert } from "lucide-react";

/**
 * The export's practical checks mark each line with an icon (30 Oct 2026; they were the
 * characters ✓, ! and i). The line's words say the result, so the icon is hidden from readers.
 */
export function PracticalCheckMark({ state }: { state: "ok" | "review" | "note" }) {
  const Icon = state === "ok" ? Check : state === "review" ? TriangleAlert : Info;
  return <Icon className="block h-4 w-4" aria-hidden="true" />;
}
