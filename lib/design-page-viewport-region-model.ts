import type {
  DesignPageSceneRegionActions,
  DesignPageSceneRegionConfiguration,
  DesignPageSceneRegionProps,
  DesignPageSceneRegionReferences,
  DesignPageSceneRegionState,
} from "@/components/editor/design-page/DesignPageSceneRegion";
import type { DesignPageSceneCanvasRegionModel } from "@/lib/design-page-scene-region-model";

export type DesignPageViewportRegionModel = {
  state: DesignPageSceneRegionState["viewport"];
  configuration: DesignPageSceneRegionConfiguration["viewport"];
  references: DesignPageSceneRegionReferences["viewport"];
  actions: DesignPageSceneRegionActions["viewport"];
};

export type BuildDesignPageViewportRegionModelInput =
  DesignPageViewportRegionModel;

/** Pure viewport contract builder for import-based wiring tests. */
export function buildDesignPageViewportRegionModel(
  input: BuildDesignPageViewportRegionModelInput
): DesignPageViewportRegionModel {
  return {
    state: input.state,
    configuration: input.configuration,
    references: input.references,
    actions: input.actions,
  };
}

export type ComposeDesignPageSceneRegionModelInput = {
  scene: DesignPageSceneCanvasRegionModel;
  viewport: DesignPageViewportRegionModel;
};

/**
 * Combines independently prepared canvas and viewport models into the grouped
 * props consumed by DesignPageSceneRegion without adding rendering policy.
 */
export function composeDesignPageSceneRegionModel({
  scene,
  viewport,
}: ComposeDesignPageSceneRegionModelInput): DesignPageSceneRegionProps {
  return {
    state: {
      ...scene.state,
      viewport: viewport.state,
    },
    configuration: {
      ...scene.configuration,
      viewport: viewport.configuration,
    },
    references: {
      ...scene.references,
      viewport: viewport.references,
    },
    resolvers: scene.resolvers,
    actions: {
      ...scene.actions,
      viewport: viewport.actions,
    },
  };
}
