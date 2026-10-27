"use client";

import { useCallback, useMemo, useState } from "react";
import type { CondoDevelopmentSummary } from "@/lib/condo-map/condo-map-data";
import type { CondoPick } from "./condo-map-mapbox";
import {
  NO_CONDO_VIEW,
  boundsAround,
  chooseUnit,
  chosenUnitCard,
  condoMapCredits,
  type CondoMapView,
} from "./condo-map-view";
import { CondoMapPanel } from "./CondoMapPanel";
import { CondoUnitCard } from "./CondoUnitCard";
import { useCondoMap } from "./useCondoMap";
import { useCondoMapData } from "./useCondoMapData";

/**
 * The admin condo map (/admin/condo-map): every development from the floor-plan masters on a Mapbox map, each on its
 * own site, with its floors and units to choose from the panel or by clicking the map. Without a token the panel and
 * the unit cards still work; the map says what it needs.
 */
function mapMessage(token: string | null, ready: boolean, problem: string | null): string | null {
  if (!token) return "The map needs a Mapbox public token: set MAPBOX_PUBLIC_TOKEN (a pk. token restricted to this app's addresses) and reload.";
  if (problem) return problem;
  return ready ? null : "Loading the map…";
}

export function CondoMapExplorer({ developments, token }: { developments: CondoDevelopmentSummary[]; token: string | null }) {
  const { maps, failures } = useCondoMapData(developments.map((summary) => summary.slug).join(","));
  const [view, setView] = useState<CondoMapView>(NO_CONDO_VIEW);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const overview = useMemo(() => boundsAround(developments.map((summary) => summary.centre)), [developments]);
  const onPick = useCallback((pick: CondoPick | null) => setView((current) => chooseUnit(current, maps, pick)), [maps]);
  const { ready, problem, modelsFailed } = useCondoMap({ token, container, overview, maps, view, onPick });
  const nameOf = (slug: string) => developments.find((summary) => summary.slug === slug)?.name ?? slug;
  const unit = chosenUnitCard(view, maps);
  const message = mapMessage(token, ready, problem);
  const credits = condoMapCredits(maps);
  return (
    <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
      <aside aria-label="Developments, floors and units" className="space-y-4">
        <CondoMapPanel developments={developments} maps={maps} failed={failures.map((failure) => failure.slug)} view={view} onView={setView} />
        {unit && view.slug ? (
          <CondoUnitCard slug={view.slug} unit={unit} onClose={() => setView((current) => chooseUnit(current, maps, null))} />
        ) : null}
      </aside>
      <section aria-label="Map" className="min-w-0 space-y-2">
        <div className="relative h-[78vh] min-h-[30rem] overflow-hidden rounded-xl border border-separator bg-surface-secondary">
          {/* Sized by height, not by absolute positioning: mapbox-gl.css (loaded after the app's styles) sets the map
              container to position: relative, which collapsed an absolute inset-0 box to 0 px tall. */}
          <div ref={setContainer} className="h-full w-full" />
          {message ? (
            <p role="status" className="absolute left-4 right-4 top-4 rounded-lg bg-surface-elevated p-3 text-sm text-label shadow">
              {message}
            </p>
          ) : null}
        </div>
        {failures.length > 0 ? (
          <p role="alert" className="text-sm text-danger">
            Some developments didn&apos;t load: {failures.map((failure) => `${nameOf(failure.slug)} (${failure.detail})`).join("; ")}.
          </p>
        ) : null}
        {modelsFailed.length > 0 ? (
          <p role="alert" className="text-sm text-danger">
            The 3D models of {modelsFailed.map(nameOf).join(" and ")} didn&apos;t load, so {modelsFailed.length === 1 ? "it is" : "they are"} drawn as
            massing.
          </p>
        ) : null}
        <ul aria-label="Credits" className="space-y-1 text-xs text-label-secondary">
          {credits.map((credit) => (
            <li key={credit}>{credit}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
