import { useMemo } from "react";

import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";
import {
  mapPlanAnnotationsToRoomRenderer,
  mapPlanFixedElementsToRoomRenderer,
  mapPlanOpeningsToRoomRenderer,
} from "@/lib/design-page-plan-overlays";
import type { EditorScene2D } from "@/lib/editorScene";

/**
 * The plan's openings, fixed elements and annotations in the 2D renderer's
 * form, rebuilt only when the scene or the rooms change. Built inline, they
 * were new arrays on every page render (a click, a selection), and resolving
 * the openings' hosts alone took about 1 ms on a 13-room plan.
 */
export function useRoomRendererPlanOverlays(
  scene: Pick<EditorScene2D, "openings" | "fixedElements" | "annotations">,
  rooms: HousePlanRoom2D[],
  hideCanonicalFixedElements: boolean
) {
  const { openings, fixedElements, annotations } = scene;
  const rendererOpenings = useMemo(() => mapPlanOpeningsToRoomRenderer(openings, rooms), [openings, rooms]);
  const rendererFixedElements = useMemo(
    () => mapPlanFixedElementsToRoomRenderer(hideCanonicalFixedElements
      ? fixedElements.filter((element) => !element.canonicalKind) : fixedElements),
    [fixedElements, hideCanonicalFixedElements]
  );
  const rendererAnnotations = useMemo(() => mapPlanAnnotationsToRoomRenderer(annotations), [annotations]);
  return { openings: rendererOpenings, fixedElements: rendererFixedElements, annotations: rendererAnnotations };
}
