import { RegisteredCadSourceAdapter } from "./cad-source-adapter";
import { DXF_PARSER_VERSION, parseAsciiDxf } from "./dxf-parser";

export const DXF_MIME_TYPES = [
  "application/dxf",
  "application/x-dxf",
  "image/vnd.dxf",
] as const;

export class DxfFloorPlanSourceAdapter extends RegisteredCadSourceAdapter {
  constructor() {
    super({
      id: "ascii-dxf-deterministic",
      extractionVersion: DXF_PARSER_VERSION,
      format: "dxf",
      mimeTypes: DXF_MIME_TYPES,
      extensions: [".dxf"],
      parse(source) {
        return parseAsciiDxf(source.bytes);
      },
    });
  }
}
