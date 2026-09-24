import sharp from "sharp";
import type { PhotoCorrection } from "../floor-plan-photo-constraints";
import { rectifyPhotoPixels } from "../floor-plan-photo-raster";
import { validatePhotoCorrection } from "../floor-plan-photo-calibration";

export async function correctedPhotoPng(bytes:Uint8Array,correction:PhotoCorrection):Promise<Uint8Array> {
  const source=await sharp(bytes,{limitInputPixels:16_000_000}).toColourspace("srgb").ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const error=validatePhotoCorrection(correction,source.info.width,source.info.height);
  if(error) throw new Error(error);
  const pixels=rectifyPhotoPixels(source.data,source.info.width,source.info.height,correction);
  return sharp(pixels,{raw:{width:correction.correctedWidthPx,height:correction.correctedHeightPx,channels:4}}).png().toBuffer();
}
