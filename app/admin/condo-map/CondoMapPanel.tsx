import { Chip } from "@/components/ui/Chip";
import { ChoiceTile } from "@/components/ui/ChoiceTile";
import type { CondoDevelopmentMap, CondoDevelopmentSummary } from "@/lib/condo-map/condo-map-data";
import {
  chooseDevelopment,
  chooseFloor,
  chooseUnit,
  floorName,
  unitsOnFloor,
  type CondoMapView,
  type CondoMapsBySlug,
} from "./condo-map-view";

/**
 * The condo map's side panel: the developments, then the chosen one's floors and the chosen floor's units. Every
 * change goes through the view's pure steps (condo-map-view), as the map's clicks do.
 */
export type CondoViewChange = (change: (view: CondoMapView) => CondoMapView) => void;

function DevelopmentList({
  developments,
  maps,
  failed,
  view,
  onView,
}: {
  developments: readonly CondoDevelopmentSummary[];
  maps: CondoMapsBySlug;
  failed: readonly string[];
  view: CondoMapView;
  onView: CondoViewChange;
}) {
  return (
    <section aria-labelledby="condo-map-developments">
      <h2 id="condo-map-developments" className="text-sm font-semibold text-label">
        Developments
      </h2>
      <ul className="mt-2 space-y-2">
        {developments.map((summary) => {
          const chosen = view.slug === summary.slug;
          const look = summary.detailed ? "detailed model" : "massing";
          return (
            <li key={summary.slug}>
              <ChoiceTile
                selected={chosen}
                className="w-full px-3 py-2 text-left"
                onClick={() => onView((current) => chooseDevelopment(current, chosen ? null : summary.slug))}
              >
                <span className="block text-sm font-semibold">{summary.name}</span>
                <span className="block text-xs text-label-secondary">
                  {summary.units} units · {look}
                  {maps[summary.slug] ? "" : failed.includes(summary.slug) ? " · didn't load" : " · loading"}
                </span>
              </ChoiceTile>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function FloorPicker({ dev, maps, view, onView }: { dev: CondoDevelopmentMap; maps: CondoMapsBySlug; view: CondoMapView; onView: CondoViewChange }) {
  const units = view.floor === null ? [] : unitsOnFloor(dev, view.floor);
  return (
    <section aria-labelledby="condo-map-floors" className="space-y-2">
      <div>
        <h2 id="condo-map-floors" className="text-sm font-semibold text-label">
          {dev.name}
        </h2>
        <p className="text-xs text-label-secondary">{dev.subtitle}</p>
        <p className="text-xs text-label-secondary">Placed on {dev.placedOn}.</p>
      </div>
      <div role="group" aria-label="Floor" className="flex flex-wrap gap-2">
        <Chip pressed={view.floor === null} onClick={() => onView((current) => chooseFloor(current, null))}>
          Whole building
        </Chip>
        {dev.unitFloors.map((floor) => (
          <Chip
            key={floor}
            aria-label={floorName(floor)}
            pressed={view.floor === floor}
            onClick={() => onView((current) => chooseFloor(current, floor))}
          >
            {floor}
          </Chip>
        ))}
      </div>
      {view.floor === null ? (
        <p className="text-xs text-label-secondary">Choose a floor, or click a unit on the map.</p>
      ) : (
        <div role="group" aria-label={`Units on ${floorName(view.floor)}`} className="flex flex-wrap gap-2">
          {units.map((unit) => (
            <Chip
              key={unit.unit}
              pressed={view.unit === unit.unit}
              onClick={() => onView((current) => chooseUnit(current, maps, { slug: dev.slug, unit: unit.unit }))}
            >
              {unit.unit}
            </Chip>
          ))}
        </div>
      )}
    </section>
  );
}

export function CondoMapPanel(props: {
  developments: readonly CondoDevelopmentSummary[];
  maps: CondoMapsBySlug;
  failed: readonly string[];
  view: CondoMapView;
  onView: CondoViewChange;
}) {
  const dev = props.view.slug ? props.maps[props.view.slug] : undefined;
  return (
    <div className="space-y-4">
      <DevelopmentList {...props} />
      {dev ? <FloorPicker dev={dev} maps={props.maps} view={props.view} onView={props.onView} /> : null}
    </div>
  );
}
