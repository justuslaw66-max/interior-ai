import { FloorPlanSourceAdapterRegistry } from "./source-adapter";
import { PdfRasterFloorPlanSourceAdapter } from "./pdf-raster-adapter";
import { DxfFloorPlanSourceAdapter } from "./dxf-source-adapter";
import { IfcFloorPlanSourceAdapter } from "./ifc-source-adapter";
import {
  DwgFloorPlanSourceAdapter,
  type DwgConversionProvider,
} from "./dwg-source-adapter";

export function createDefaultFloorPlanSourceAdapterRegistry(options: {
  dwgConversionProvider?: DwgConversionProvider;
} = {}) {
  return new FloorPlanSourceAdapterRegistry([
    new PdfRasterFloorPlanSourceAdapter(),
    new DxfFloorPlanSourceAdapter(),
    new IfcFloorPlanSourceAdapter(),
    new DwgFloorPlanSourceAdapter(options.dwgConversionProvider),
  ]);
}
