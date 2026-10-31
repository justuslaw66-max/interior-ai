/**
 * A raster upload as the import reads it: EXIF orientation applied and any transparency put on white, as PNG. This is
 * the "exif_oriented_source_px" space of raster_deskew_v1 (raster-linework.ts normalizes from it), and what the
 * faithful trace reads where the app turned the page square (vectorizer-pass.ts): turning resamples the page.
 */
const MAX_RASTER_INPUT_PIXELS = 40_000_000;

export async function orientRasterUpload(bytes: Uint8Array) {
  const { default: sharp } = await import("sharp");
  return sharp(bytes, { limitInputPixels: MAX_RASTER_INPUT_PIXELS, sequentialRead: true })
    .rotate()
    .flatten({ background: "#ffffff" })
    .png()
    .toBuffer({ resolveWithObject: true });
}
