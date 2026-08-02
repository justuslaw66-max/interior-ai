import type {
  DesignPageSceneRegionActions,
  DesignPageSceneRegionConfiguration,
  DesignPageSceneRegionReferences,
  DesignPageSceneRegionResolvers,
  DesignPageSceneRegionState,
} from "@/components/editor/design-page/DesignPageSceneRegion";

type SceneChildKey =
  | "canvas"
  | "structure"
  | "guidance"
  | "items"
  | "preview";

export type DesignPageSceneCanvasRegionModel = {
  state: Pick<DesignPageSceneRegionState, SceneChildKey>;
  configuration: Pick<DesignPageSceneRegionConfiguration, SceneChildKey>;
  references: Pick<DesignPageSceneRegionReferences, "canvas">;
  resolvers: DesignPageSceneRegionResolvers;
  actions: Pick<
    DesignPageSceneRegionActions,
    "shell" | SceneChildKey
  >;
};

export type BuildDesignPageSceneCanvasRegionModelInput =
  DesignPageSceneCanvasRegionModel;

/**
 * Establishes the typed boundary between editor policy/controllers and the
 * policy-free scene composition. The function is intentionally pure so its
 * wiring can be covered without rendering React or the Three.js canvas.
 */
export function buildDesignPageSceneCanvasRegionModel(
  input: BuildDesignPageSceneCanvasRegionModelInput
): DesignPageSceneCanvasRegionModel {
  return {
    state: input.state,
    configuration: input.configuration,
    references: input.references,
    resolvers: input.resolvers,
    actions: input.actions,
  };
}
