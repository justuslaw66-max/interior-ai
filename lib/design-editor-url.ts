export type DesignEditorMode = "homeowner" | "designer";
export type DesignEditorView = "2d" | "3d";
export type DesignEditorWorkspace = "design" | "furnish";

export type DesignEditorUrlInput = Readonly<{
  designId: string;
  mode?: DesignEditorMode;
  view?: DesignEditorView;
  workspace?: DesignEditorWorkspace;
  floorPlanImportId?: string;
  context?: Pick<URLSearchParams, "get">;
}>;

/** Builds the canonical saved-design editor URL from an explicit parameter set. */
export function buildDesignEditorUrl({
  designId,
  mode,
  view,
  workspace,
  floorPlanImportId,
  context,
}: DesignEditorUrlInput): string {
  if (designId.length === 0) {
    throw new TypeError("design ID required");
  }

  let url = `/design?designId=${encodeURIComponent(designId)}`;
  const contextualParameters = [
    [mode ?? context?.get("mode"), "designer", "&mode=designer"],
    [view ?? context?.get("view"), "2d", "&view=2d"],
    [workspace ?? context?.get("workspace"), "furnish", "&workspace=furnish"],
  ] as const;
  for (const [actual, expected, suffix] of contextualParameters) {
    if (actual === expected) url += suffix;
  }
  if (floorPlanImportId) {
    url += `&floorPlanImport=${encodeURIComponent(floorPlanImportId)}`;
  }
  return url;
}
