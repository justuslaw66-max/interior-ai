import { RegisteredCadSourceAdapter } from "./cad-source-adapter";
import { IFC_PARSER_VERSION, parseIfcStep } from "./ifc-parser";

export const IFC_MIME_TYPES = [
  "application/ifc",
  "application/x-ifc",
  "application/step",
  "application/x-step",
] as const;

export class IfcFloorPlanSourceAdapter extends RegisteredCadSourceAdapter {
  constructor() {
    super({
      id: "ifc-step-deterministic",
      extractionVersion: IFC_PARSER_VERSION,
      format: "ifc",
      mimeTypes: IFC_MIME_TYPES,
      extensions: [".ifc", ".ifcstep", ".stp", ".step"],
      parse(source) {
        return parseIfcStep(source.bytes);
      },
    });
  }
}
