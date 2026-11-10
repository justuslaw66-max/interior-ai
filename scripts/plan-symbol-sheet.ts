/**
 * Draws every 2D plan symbol, at its typical size and at the sizes that change
 * how it is drawn, onto one SVG sheet for review.
 *
 *   npx tsx scripts/plan-symbol-sheet.ts docs/architecture/plan-symbol-sheet.svg
 */
import { writeFileSync } from "node:fs";

import { PLAN_SYMBOLS, PLAN_SYMBOL_KINDS, buildPlanSymbol, type PlanSymbolGroup } from "../lib/plan-symbols/plan-symbol-library";
import { planSymbolSvgGroup } from "../lib/plan-symbols/plan-symbol-svg";
import type { PlanSymbolKind, PlanSymbolOptions } from "../lib/plan-symbols/plan-symbol-types";

type SheetEntry = { kind: PlanSymbolKind; width: number; depth: number; options?: PlanSymbolOptions; note?: string };

/** Extra sizes that show a symbol adapting to the product. */
const VARIANTS: SheetEntry[] = [
  { kind: "sofa", width: 1.5, depth: 0.85, note: "2-seat" },
  { kind: "sectional_sofa", width: 2.6, depth: 1.55, options: { chaiseSide: "left" }, note: "chaise left" },
  { kind: "coffee_table", width: 0.8, depth: 0.8, note: "round" },
  { kind: "dining_table", width: 1.0, depth: 1.0, note: "round" },
  { kind: "dining_set", width: 1.85, depth: 1.65, note: "4 chairs" },
  { kind: "dining_set", width: 3.3, depth: 1.8, note: "10 chairs" },
  { kind: "round_dining_set", width: 1.6, depth: 1.6, note: "smaller" },
  { kind: "bed", width: 0.95, depth: 2.0, note: "single" },
  { kind: "bed", width: 1.85, depth: 2.15, note: "king" },
  { kind: "hob", width: 0.3, depth: 0.52, note: "domino" },
  { kind: "hob", width: 0.86, depth: 0.5, note: "3 burners" },
  { kind: "hob", width: 0.6, depth: 0.52, note: "4 burners" },
  { kind: "hob", width: 0.9, depth: 0.52, options: { burners: 5 }, note: "5 burners" },
  { kind: "kitchen_sink", width: 0.5, depth: 0.45, note: "single" },
  { kind: "kitchen_sink", width: 1.0, depth: 0.5, note: "with drainer" },
  { kind: "vanity", width: 1.4, depth: 0.5, note: "double" },
];

const PX_PER_METRE = 110;
const SHEET_WIDTH = 1700;
const GAP = 34;
const LABEL_SPACE = 34;

function sheetEntries(): Array<SheetEntry & { group: PlanSymbolGroup }> {
  const entries: Array<SheetEntry & { group: PlanSymbolGroup }> = [];
  for (const kind of PLAN_SYMBOL_KINDS) {
    const { group, typical } = PLAN_SYMBOLS[kind];
    entries.push({ kind, group, ...typical });
    for (const variant of VARIANTS.filter((entry) => entry.kind === kind)) entries.push({ ...variant, group });
  }
  return entries;
}

function xml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

function label(text: string, x: number, y: number, size: number, weight = 400) {
  return `<text x="${x}" y="${y}" font-family="Helvetica, Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="#333" text-anchor="middle">${xml(text)}</text>`;
}

export function buildPlanSymbolSheet(): string {
  const parts: string[] = [];
  let x = GAP;
  let y = 70;
  let rowHeight = 0;
  let group: PlanSymbolGroup | null = null;
  for (const entry of sheetEntries()) {
    const w = entry.width * PX_PER_METRE;
    const h = entry.depth * PX_PER_METRE;
    const cellWidth = Math.max(w, 150);
    if (entry.group !== group || x + cellWidth > SHEET_WIDTH - GAP) {
      y += rowHeight + (rowHeight ? GAP : 0);
      x = GAP;
      rowHeight = 0;
      if (entry.group !== group) {
        group = entry.group;
        parts.push(`<text x="${GAP}" y="${y + 18}" font-family="Helvetica, Arial, sans-serif" font-size="20" font-weight="700" fill="#111">${xml(group)}</text>`);
        y += 40;
      }
    }
    const symbol = buildPlanSymbol(entry.kind, entry.width, entry.depth, entry.options);
    const cx = x + cellWidth / 2;
    parts.push(`<g transform="translate(${cx} ${y + h / 2})">${planSymbolSvgGroup(symbol, { pxPerMetre: PX_PER_METRE })}</g>`);
    const name = PLAN_SYMBOLS[entry.kind].label + (entry.note ? ` (${entry.note})` : "");
    parts.push(label(name, cx, y + h + 16, 13, 600));
    parts.push(label(`${Math.round(entry.width * 1000)} × ${Math.round(entry.depth * 1000)}`, cx, y + h + 30, 11));
    x += cellWidth + GAP;
    rowHeight = Math.max(rowHeight, h + LABEL_SPACE);
  }
  const height = y + rowHeight + GAP;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SHEET_WIDTH}" height="${height}" viewBox="0 0 ${SHEET_WIDTH} ${height}">`,
    `<rect width="${SHEET_WIDTH}" height="${height}" fill="#fff"/>`,
    `<text x="${GAP}" y="40" font-family="Helvetica, Arial, sans-serif" font-size="26" font-weight="700" fill="#111">Interior AI 2D plan symbols</text>`,
    `<text x="${SHEET_WIDTH - GAP}" y="40" font-family="Helvetica, Arial, sans-serif" font-size="13" fill="#555" text-anchor="end">Sizes in mm · drawn from each product's footprint · back edge at the top</text>`,
    ...parts,
    "</svg>",
  ].join("\n");
}

const output = process.argv[2];
if (output) {
  writeFileSync(output, buildPlanSymbolSheet());
  console.log(`Wrote ${output}`);
}
