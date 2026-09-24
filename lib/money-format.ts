/**
 * The one money format for prices, carts and room totals. Catalog prices are
 * Castlery Singapore prices in Singapore dollars, so the symbol says so
 * ("S$1,738") instead of a bare "$" that reads as US dollars. Whole dollars,
 * grouped the Singapore way.
 */
const SINGAPORE_WHOLE_DOLLARS = new Intl.NumberFormat("en-SG", {
  maximumFractionDigits: 0,
});

export function formatSgd(amount: number): string {
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? "-" : "";
  return `${sign}S$${SINGAPORE_WHOLE_DOLLARS.format(Math.abs(rounded))}`;
}
