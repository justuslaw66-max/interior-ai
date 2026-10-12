import type { SurfaceMaterial } from "./surface-material-schema";

// Surface materials with no picture of their own on the manufacturer's download area (J, 12 Oct 2026: "keep a
// record of those sizes that do not have an original picture, remark them somewhere visible in the admin page").
// A stand-in draws another item's faces, cut to its tile at true scale (qa flag stand_in_faces); an entry on the
// configurator's preview has no faces at all (qa flag configurator_preview_asset). The admin audit page lists both;
// docs/architecture/surface-material-tile-faces.md keeps the record, with the sizes left out of the catalogue.

export const STAND_IN_FACES_QA_FLAG = "stand_in_faces";
export const CONFIGURATOR_PREVIEW_QA_FLAG = "configurator_preview_asset";

export type NoOwnPictureSource = "stand_in" | "configurator_preview";

export type NoOwnPicture = {
  source: NoOwnPictureSource;
  /** For a stand-in, the item whose faces it draws: the faces' file prefix ("0031173_01.webp" -> "0031173"). */
  facesOf: string | null;
};

type PictureEntry = Pick<SurfaceMaterial, "import_governance" | "texture_assets">;

function facesOf(entry: PictureEntry): string | null {
  const url = entry.texture_assets?.faces?.[0]?.url ?? "";
  return /\/([^/]+)_\d+\.[a-z]+$/.exec(url)?.[1] ?? null;
}

export function findNoOwnPicture(entry: PictureEntry): NoOwnPicture | null {
  const flags = entry.import_governance?.qa_flags ?? [];
  if (flags.includes(STAND_IN_FACES_QA_FLAG)) return { source: "stand_in", facesOf: facesOf(entry) };
  if (flags.includes(CONFIGURATOR_PREVIEW_QA_FLAG) && !entry.texture_assets?.faces?.length) {
    return { source: "configurator_preview", facesOf: null };
  }
  return null;
}

/** Every entry with no picture of its own, by its catalogue file. */
export function collectNoOwnPictures(
  entries: readonly (PictureEntry & { file_path: string })[]
): Map<string, NoOwnPicture> {
  const found = new Map<string, NoOwnPicture>();
  for (const entry of entries) {
    const noOwnPicture = findNoOwnPicture(entry);
    if (noOwnPicture) found.set(entry.file_path, noOwnPicture);
  }
  return found;
}

export function describeNoOwnPicture({ source, facesOf: item }: NoOwnPicture): string {
  if (source === "configurator_preview") {
    return "No picture of its own on the manufacturer's download area: it shows the configurator's preview.";
  }
  const faces = item ? `item ${item}'s faces` : "another item's faces";
  return `No picture of its own on the manufacturer's download area: it draws ${faces}, cut to the tile at true scale.`;
}
