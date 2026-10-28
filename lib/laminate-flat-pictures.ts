/**
 * Where a laminate's flat colour is drawn from: a one-colour PNG named by the colour (J, 27 Oct 2026: "Flat colour sheets"),
 * written by scripts/generate-laminate-flat-pictures.ts. Kept apart from the laminate catalogue so the browser can tell a flat
 * colour by its picture without loading the catalogue.
 */
const LAMINATE_FLAT_PICTURE_URL_PREFIX = "/assets/catalog/laminates/flat-colours/";

/** A flat colour's picture: one colour, the same for every design of that colour. */
export function getLaminateFlatPictureUrl(colour: string): string {
  return `${LAMINATE_FLAT_PICTURE_URL_PREFIX}${colour.replace(/^#/, "").toLowerCase()}.png`;
}

/** Whether a surface material draws a laminate's flat colour. */
export function isLaminateFlatPicture(url: string | null | undefined): boolean {
  return Boolean(url?.startsWith(LAMINATE_FLAT_PICTURE_URL_PREFIX));
}
