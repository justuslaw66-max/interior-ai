"use client";

import type { ReactNode } from "react";
import { formatSgd } from "@/lib/money-format";
import { productCountLabel, type ShoppingListLine } from "@/lib/shopping-list";
import { ShoppingListRow, type ShoppingListRowProps } from "./ShoppingListRow";

export type ShoppingListSectionProps = Omit<ShoppingListRowProps, "line"> & {
  /** Where the products are bought: "castlery.com", "here" or "unavailable". */
  sectionId: string;
  title: string;
  lines: readonly ShoppingListLine[];
  /** The group's subtotal, or a note in its place ("No buy link yet"). */
  aside?: ReactNode;
  subtotal?: number;
};

/** A shop's products, with the shop's name, count and subtotal above them (FU8). */
export function ShoppingListSection({ sectionId, title, lines, aside, subtotal, ...row }: ShoppingListSectionProps) {
  const headingId = `shopping-section-${sectionId.replace(/[^a-z0-9-]/gi, "-")}`;
  return (
    <section
      aria-labelledby={headingId}
      data-testid="shopping-list-section"
      data-section={sectionId}
      className="overflow-hidden rounded-2xl border border-neutral-200 bg-white"
    >
      <div className="flex min-h-12 items-center justify-between gap-3 border-b border-neutral-200 px-3.5 py-2.5 md:min-h-14 md:px-5">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <h2 id={headingId} className="truncate text-[15px] font-bold text-neutral-900 md:text-base">
            {title}
          </h2>
          <span className="shrink-0 text-[13px] text-neutral-600">{productCountLabel(lines.length)}</span>
        </div>
        <span className="shrink-0 text-[15px] font-bold text-neutral-900 md:text-base">
          {aside ?? (subtotal != null ? formatSgd(subtotal) : null)}
        </span>
      </div>
      <ul className="m-0 list-none p-0">
        {lines.map((line) => (
          <ShoppingListRow key={line.instanceId} line={line} {...row} />
        ))}
      </ul>
    </section>
  );
}
