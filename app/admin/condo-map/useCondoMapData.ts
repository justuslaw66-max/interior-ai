import { useEffect, useState } from "react";
import { condoMapFileUrl, parseCondoDevelopmentMap, type CondoDevelopmentMap } from "@/lib/condo-map/condo-map-data";
import type { CondoMapsBySlug } from "./condo-map-view";

/**
 * Each development's map (its map.json from the admin data route), fetched once the page is up, all at the same time;
 * each is drawn as soon as it arrives. A map that fails to load or to read is reported and the rest still draw.
 */
export type CondoMapFailure = { slug: string; detail: string };
export type CondoMapData = { maps: CondoMapsBySlug; failures: CondoMapFailure[] };

async function fetchDevelopmentMap(slug: string, signal: AbortSignal): Promise<CondoDevelopmentMap> {
  const response = await fetch(condoMapFileUrl(slug, "map.json"), { signal, credentials: "same-origin" });
  if (!response.ok) throw new Error(`the data route answered ${response.status}`);
  return parseCondoDevelopmentMap(await response.json(), `${slug}/map.json`);
}

export function useCondoMapData(slugKey: string): CondoMapData {
  const [data, setData] = useState<CondoMapData>({ maps: {}, failures: [] });
  useEffect(() => {
    const controller = new AbortController();
    for (const slug of slugKey.split(",").filter(Boolean)) {
      fetchDevelopmentMap(slug, controller.signal).then(
        (dev) => setData((current) => ({ ...current, maps: { ...current.maps, [slug]: dev } })),
        (cause: unknown) => {
          if (controller.signal.aborted) return;
          const detail = cause instanceof Error ? cause.message : "it didn't load";
          setData((current) => ({ ...current, failures: [...current.failures, { slug, detail }] }));
        }
      );
    }
    return () => controller.abort();
  }, [slugKey]);
  return data;
}
