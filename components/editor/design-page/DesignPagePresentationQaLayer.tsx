import {
  DesignPageProjectQaMarkers,
  DesignPageRuntimeQaMarkers,
  type DesignPageProjectQaMarkersProps,
  type DesignPageRuntimeQaMarkersProps,
} from "@/components/editor/design-page/DesignPageQaMarkers";
import {
  EditorCommandPalette,
  type EditorCommandPaletteProps,
} from "@/components/editor/design-page/EditorCommandPalette";
import {
  PlacedCabinetAssetMarkers,
  type PlacedCabinetAssetMarkersProps,
} from "@/components/editor/design-page/PlacedCabinetAssetMarkers";

export interface DesignPagePresentationQaLayerProps {
  project: DesignPageProjectQaMarkersProps;
  cabinetAssets: PlacedCabinetAssetMarkersProps;
  runtime: DesignPageRuntimeQaMarkersProps;
  commandPalette: EditorCommandPaletteProps;
}

export function DesignPagePresentationQaLayer({
  project,
  cabinetAssets,
  runtime,
  commandPalette,
}: DesignPagePresentationQaLayerProps) {
  return (
    <>
      <DesignPageProjectQaMarkers {...project} />
      <PlacedCabinetAssetMarkers {...cabinetAssets} />
      <DesignPageRuntimeQaMarkers {...runtime} />
      <EditorCommandPalette {...commandPalette} />
    </>
  );
}
