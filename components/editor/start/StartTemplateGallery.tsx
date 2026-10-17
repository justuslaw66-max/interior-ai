"use client";

import { useMemo, useState, type RefObject } from "react";
import { ArrowRight, Search } from "lucide-react";
import { PlanTemplatePreview } from "@/components/editor/start/PlanTemplatePreview";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
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
  /** The product lists have loaded: until then a furnished template waits, saying so. */
  furnishedReady: boolean;
  onChooseTemplate: (card: StartTemplateCard, furnished: boolean) => void;
  onSearchAddress: () => void;
};

// A link that stands alone: its own target height, 44px on phones.
const standaloneLinkClass = "h-11 text-sm md:h-9";

/** Templates, with the bedroom filters, Empty or Furnished, and the address search, as in the mockup. */
export function StartTemplateGallery({ headingRef, ready, furnishedReady, onChooseTemplate, onSearchAddress }: StartTemplateGalleryProps) {
  const cards = useMemo(() => buildStartTemplateCards(), []);
  const [filter, setFilter] = useState<StartTemplateFilter>("all");
  const [furnished, setFurnished] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const matching = cards.filter((card) => matchesStartTemplateFilter(card, filter));
  const shown = showAll ? matching : matching.slice(0, START_TEMPLATE_PREVIEW_COUNT);
  return (
    <section aria-labelledby="start-templates-title" data-testid="start-templates" className="mt-9 flex flex-col">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <h2 ref={headingRef} id="start-templates-title" tabIndex={-1} className="text-xl font-bold outline-hidden">
          Templates
        </h2>
        <div role="group" aria-label="Filter templates" className="flex flex-wrap items-center gap-2">
          {START_TEMPLATE_FILTERS.map(({ key, label }) => (
            <Chip key={String(key)} data-testid={`start-template-filter-${key}`} pressed={filter === key}
              onClick={() => { setFilter(key); setShowAll(false); }}>
              {label}
              <span className="font-normal opacity-80">{cards.filter((card) => matchesStartTemplateFilter(card, key)).length}</span>
            </Chip>
          ))}
        </div>
        <div className="hidden flex-1 lg:block" />
        <SegmentedControl
          label="Template contents"
          size="compact"
          value={furnished ? "furnished" : "empty"}
          onChange={(contents) => setFurnished(contents === "furnished")}
          options={[
            { value: "empty", label: "Empty", testId: "start-template-empty" },
            { value: "furnished", label: "Furnished", testId: "start-template-furnished" },
          ]}
        />
        <Button variant="link" size="inline" data-testid="start-template-address-search" onClick={onSearchAddress}
          className={standaloneLinkClass}>
          <Search aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
          Search by HDB address
        </Button>
      </div>
      {furnished && !furnishedReady ? (
        <p role="status" data-testid="start-template-products-loading" className="mt-3 text-sm text-neutral-600">
          Loading products for furnished templates…
        </p>
      ) : null}
      <StartTemplateCards cards={shown} furnished={furnished} ready={ready} furnishedReady={furnishedReady}
        onChooseTemplate={onChooseTemplate} />
      {!showAll && matching.length > shown.length ? (
        <Button variant="link" size="inline" data-testid="start-templates-see-all" onClick={() => setShowAll(true)}
          className={`mt-2.5 self-start ${standaloneLinkClass}`}>
          See all {matching.length} templates
          <ArrowRight aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
        </Button>
      ) : null}
    </section>
  );
}

type StartTemplateCardsProps = {
  cards: StartTemplateCard[];
  furnished: boolean;
  ready: boolean;
  furnishedReady: boolean;
  onChooseTemplate: (card: StartTemplateCard, furnished: boolean) => void;
};

function StartTemplateCards({ cards, furnished, ready, furnishedReady, onChooseTemplate }: StartTemplateCardsProps) {
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
            disabled={!ready || (withFurniture && !furnishedReady)}
            className="flex flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white text-left text-neutral-950 outline-hidden transition hover:border-neutral-400 hover:shadow-md focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
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
