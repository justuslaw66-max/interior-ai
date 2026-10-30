import type { SurfaceSettings } from "./room-types";

/**
 * Wall panel ids, as the 3D view writes them: `wall-panel:v2:<floor>:<room>:<face>:<start>:<end>:<interior|exterior>`
 * (`getWallSurfacePanelId`, components/editor/renderers/house-plan-3d/geometry.ts). A wall with no opening is one panel,
 * from `segment-start` to `segment-end`; a door splits it into pieces beside and above it, each with anchors of its own.
 */
const WHOLE_WALL_ANCHORS = ["segment-start", "segment-end"] as const;

type SavedPanels = Readonly<Record<string, SurfaceSettings>>;

export type WallPanelIdParts = {
  floor: string;
  roomToken: string;
  faceToken: string;
  startAnchor: string;
  endAnchor: string;
  role: string;
};

/** A v2 panel id's parts; null for any other id (older ids name a render part instead). */
export function parseWallPanelId(panelId: string | null | undefined): WallPanelIdParts | null {
  const parts = panelId?.split(":") ?? [];
  if (parts.length !== 8 || parts[0] !== "wall-panel" || parts[1] !== "v2") return null;
  const [, , floor, roomToken, faceToken, startAnchor, endAnchor, role] = parts;
  return { floor, roomToken, faceToken, startAnchor, endAnchor, role };
}

/**
 * The whole wall's id for a piece of it: the first v2 id among `panelIds`, with the wall's own anchors; the same id for a
 * whole wall. A finish saved on a wall before a door split it stays on the pieces until a piece is given one of its own
 * (J, 29 Oct 2026: "Keep it on the pieces"). Null when none of the ids is a v2 id.
 */
export function getWholeWallPanelId(panelIds: readonly (string | null | undefined)[]): string | null {
  for (const panelId of panelIds) {
    const parts = parseWallPanelId(panelId);
    if (parts) return ["wall-panel", "v2", parts.floor, parts.roomToken, parts.faceToken, ...WHOLE_WALL_ANCHORS, parts.role].join(":");
  }
  return null;
}

const isSaved = (panels: SavedPanels, id: string) => Object.prototype.hasOwnProperty.call(panels, id);

/** A selected panel's saved finish: its own, an older id's, then its whole wall's; undefined when it has none. */
export function getWallPanelAssignment(
  panels: SavedPanels, panelId: string, aliases: readonly string[]
): SurfaceSettings | undefined {
  const wholeWallId = getWholeWallPanelId([panelId]);
  return [panelId, ...aliases, ...(wholeWallId ? [wholeWallId] : [])].map((id) => panels[id]).find(Boolean);
}

/**
 * A panel's saved finishes with its own replaced by `settings`, or cleared without: its older ids go too. Its whole wall's
 * finish stays, for the wall's other pieces, so a cleared piece shows it again.
 */
export function replaceWallPanelAssignment(
  panels: SavedPanels, panelId: string, aliases: readonly string[], settings?: SurfaceSettings
): Record<string, SurfaceSettings> {
  const nextPanels = { ...panels };
  [panelId, ...aliases].forEach((key) => {
    delete nextPanels[key];
  });
  if (settings) nextPanels[panelId] = settings;
  return nextPanels;
}

/** A piece of a wall side, as the 3D view lays it out: its ids, its range along the wall, and its height when short of it. */
type WallSidePiece = {
  panelId: string;
  legacyPanelIds: readonly string[];
  startOffset: number;
  endOffset: number;
  part: { height?: number };
};

const PIECE_TOLERANCE = 0.002;

/**
 * Whether a piece above a door, which can't be selected, shows its wall's whole-wall finish: the finish is saved, and a
 * piece beside that door (a full-height one meeting it) has none of its own, or none stands beside it (a door as wide as
 * the wall). Once the pieces beside the door have their own, it shows the face's finish again, as a door's lintel always did.
 */
export function isWholeWallFinishShownAbove(
  panels: SavedPanels | undefined,
  pieces: readonly WallSidePiece[],
  above: Pick<WallSidePiece, "startOffset" | "endOffset">
): boolean {
  const wholeWallId = getWholeWallPanelId(pieces.map((piece) => piece.panelId));
  if (!panels || !wholeWallId || !isSaved(panels, wholeWallId)) return false;
  const beside = pieces.filter((piece) => piece.part.height === undefined && (
    Math.abs(piece.endOffset - above.startOffset) <= PIECE_TOLERANCE || Math.abs(piece.startOffset - above.endOffset) <= PIECE_TOLERANCE));
  return beside.length === 0 || beside.some((piece) => ![piece.panelId, ...piece.legacyPanelIds].some((id) => isSaved(panels, id)));
}
