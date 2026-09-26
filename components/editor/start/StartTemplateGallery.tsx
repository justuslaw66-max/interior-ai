"use client";

import { useMemo, useState, type RefObject } from "react";
import { ArrowRight, Search } from "lucide-react";
import { PlanTemplatePreview } from "@/components/editor/start/PlanTemplatePreview";
import {
  buildStartTemplateCards,
  matchesStartTemplateFilter,
  START_TEMPLATE_FILTERS,
  START_TEMPLATE_PREVIEW_COUNT,
  type StartTemplateCard,
  type StartTemplateFilter,
} from "@/lib/start-design";

type StartTemplateGalleryProps = {
  headingRef: RefObject<HTMLHeadingElement | null>;
  ready: boolean;
  onChooseTemplate: (card: StartTemplateCard, furnished: boolean) => void;
  onSearchAddress: () => void;
};

const chipClass = (pressed: boolean) =>
  `flex h-11 items-center gap-1.5 rounded-full border px-3 text-[13px] font-bold outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 md:h-8 ${
    pressed ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-100"
  }`;
const segmentClass = (pressed: boolean) =>
  `h-11 rounded-lg px-3.5 text-[13px] font-bold text-neutral-900 outline-none focus-visible:ring-2 focus-visible:ring-blue-600 md:h-[30px] ${
    pressed ? "bg-white shadow-sm" : "bg-transparent"
  }`;

/** Templates, with the bedroom filters, Empty or Furnished, and the address search, as in the mockup. */
export function StartTemplateGallery({ headingRef, ready, onChooseTemplate, onSearchAddress }: StartTemplateGalleryProps) {
  const cards = useMemo(() => buildStartTemplateCards(), []);
  const [filter, setFilter] = useState<StartTemplateFilter>("all");
  const [furnished, setFurnished] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const matching = cards.filter((card) => matchesStartTemplateFilter(card, filter));
  const shown = showAll ? matching : matching.slice(0, START_TEMPLATE_PREVIEW_COUNT);
  return (
    <section aria-labelledby="start-templates-title" data-testid="start-templates" className="mt-9 flex flex-col">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <h2 ref={headingRef} id="start-templates-title" tabIndex={-1} className="text-xl font-bold outline-none">
          Templates
        </h2>
        <div role="group" aria-label="Filter templates" className="flex flex-wrap items-center gap-2">
          {START_TEMPLATE_FILTERS.map(({ key, label }) => (
            <button key={String(key)} type="button" data-testid={`start-template-filter-${key}`}
              aria-pressed={filter === key} className={chipClass(filter === key)}
              onClick={() => { setFilter(key); setShowAll(false); }}>
              {label}
              <span className="font-normal opacity-80">{cards.filter((card) => matchesStartTemplateFilter(card, key)).length}</span>
            </button>
          ))}
        </div>
        <div className="hidden flex-1 lg:block" />
        <div role="group" aria-label="Template contents" className="flex rounded-[10px] bg-neutral-200/70 p-[3px]">
          <button type="button" data-testid="start-template-empty" aria-pressed={!furnished}
            className={segmentClass(!furnished)} onClick={() => setFurnished(false)}>Empty</button>
          <button type="button" data-testid="start-template-furnished" aria-pressed={furnished}
            className={segmentClass(furnished)} onClick={() => setFurnished(true)}>Furnished</button>
        </div>
        <button type="button" data-testid="start-template-address-search" onClick={onSearchAddress}
          className="flex h-11 items-center gap-1.5 rounded-md text-sm font-bold text-blue-800 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-blue-600 md:h-9">
          <Search aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
          Search by HDB address
        </button>
      </div>
      <StartTemplateCards cards={shown} furnished={furnished} ready={ready} onChooseTemplate={onChooseTemplate} />
      {!showAll && matching.length > shown.length ? (
        <button type="button" data-testid="start-templates-see-all" onClick={() => setShowAll(true)}
          className="mt-2.5 flex h-11 items-center gap-1.5 self-start rounded-md text-sm font-bold text-blue-800 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-blue-600 md:h-9">
          See all {matching.length} templates
          <ArrowRight aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
        </button>
      ) : null}
    </section>
  );
}

type StartTemplateCardsProps = {
  cards: StartTemplateCard[];
  furnished: boolean;
  ready: boolean;
  onChooseTemplate: (card: StartTemplateCard, furnished: boolean) => void;
};

function StartTemplateCards({ cards, furnished, ready, onChooseTemplate }: StartTemplateCardsProps) {
  return (
    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => {
        const withFurniture = furnished && card.furnishingPackId !== null;
        return (
          <button
            key={card.template.id}
            type="button"
            data-testid={`start-template-${card.template.id}`}
            aria-label={`${card.name}, ${card.meta}${withFurniture ? ", furnished" : ""}`}
            disabled={!ready}
            className="flex flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white text-left text-neutral-950 outline-none transition hover:border-neutral-400 hover:shadow-md focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
            onClick={() => onChooseTemplate(card, withFurniture)}
          >
            <PlanTemplatePreview template={card.template} furnishingPackId={withFurniture ? card.furnishingPackId : null} />
            <span className="flex flex-col gap-1 px-3.5 pb-3.5 pt-3">
              <span className="text-[15px] font-bold">{card.name}</span>
              <span className="text-[13px] text-neutral-600">{card.meta}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
