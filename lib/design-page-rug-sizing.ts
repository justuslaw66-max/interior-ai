/**
 * Rug sizing logic: finds the best-fit rug for a given sofa width/style/budget.
 *
 * Extracted from design/page.tsx to keep PageContent lean.
 */

import { CATALOG_ITEMS } from "@/lib/catalog";
import { getItemPrice } from "@/lib/design-page-utils";

export const pickBestRugForSofa = ({
  sofaWidth,
  style: styleInput,
  budget: budgetInput,
}: {
  sofaWidth: number;
  style: string;
  budget: "$" | "$$" | "$$$";
}) => {
  const styleNorm = styleInput.toLowerCase();
  const minRugW = sofaWidth + 0.3;
  const maxRugW = sofaWidth + 0.5;
  const targetRugW = sofaWidth + 0.4;

  const rugs = Object.values(CATALOG_ITEMS).filter((p) => p.category === "rug");
  const styleRugs = rugs.filter((r) =>
    r.styleTags.some((t) => t.toLowerCase() === styleNorm)
  );

  const pool = styleRugs.length ? styleRugs : rugs;
  const sortedByPrice = [...pool].sort((a, b) => getItemPrice(a) - getItemPrice(b));
  const budgetPool =
    budgetInput === "$"
      ? sortedByPrice.slice(
          0,
          Math.max(2, Math.floor(sortedByPrice.length * 0.4))
        )
      : budgetInput === "$$$"
        ? sortedByPrice.slice(Math.floor(sortedByPrice.length * 0.6))
        : sortedByPrice;

  if (!budgetPool.length) return null;

  const within = budgetPool.filter(
    (r) => r.dimsMm.w / 1000 >= minRugW && r.dimsMm.w / 1000 <= maxRugW
  );

  const candidates = within.length ? within : budgetPool;

  let best = candidates[0];
  let bestDiff = Math.abs(best.dimsMm.w / 1000 - targetRugW);

  for (const r of candidates) {
    const diff = Math.abs(r.dimsMm.w / 1000 - targetRugW);
    if (diff < bestDiff) {
      best = r;
      bestDiff = diff;
    }
  }

  return best;
};
