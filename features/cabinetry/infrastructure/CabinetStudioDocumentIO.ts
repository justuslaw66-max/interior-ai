import { downloadCabinetFabricationDxf } from "../exportCabinetFabricationDxf";
import {
  downloadCabinetGlb,
  exportCabinetAsGlb,
} from "../exportCabinetGlb";
import { downloadCabinetShopDrawingSvg } from "../exportCabinetShopDrawingSvg";
import { generateCabinetBOM } from "../generateCabinetBOM";
import {
  downloadCabinetDocumentationCsv,
  downloadCabinetDocumentationPackageJson,
  downloadCabinetFabricationQuoteRequestJson,
  downloadCabinetSourceDefinitionJson,
  parseCabinetSourceDefinitionJson,
} from "../generateCabinetDocumentation";
import {
  validateCabinetSourceImportFile,
  type CabinetSourceImportFileInfo,
} from "../importPolicy";
import type { CabinetBOMItem, CabinetDefinition } from "../types";

export type CabinetStudioExportArtifact =
  | "glb"
  | "documentation_csv"
  | "source_definition_json"
  | "shop_drawing_svg"
  | "fabrication_dxf"
  | "fabrication_rfq_json"
  | "millwork_package_json";

export type CabinetStudioExportBusyAction =
  | "download"
  | "docs"
  | "source"
  | "shopDrawing"
  | "dxf"
  | "rfq"
  | "package";

export interface CabinetStudioExportDescriptor {
  artifact: CabinetStudioExportArtifact;
  busyAction: CabinetStudioExportBusyAction;
  successMessage: string;
  fallbackError: string;
}

export interface CabinetStudioDocumentIOPorts {
  downloadGlb: (definition: CabinetDefinition) => void | Promise<void>;
  downloadDocumentationCsv: (definition: CabinetDefinition) => void | Promise<void>;
  downloadSourceDefinitionJson: (definition: CabinetDefinition) => void | Promise<void>;
  downloadShopDrawingSvg: (definition: CabinetDefinition) => void | Promise<void>;
  downloadFabricationDxf: (definition: CabinetDefinition) => void | Promise<void>;
  downloadFabricationQuoteRequestJson: (
    definition: CabinetDefinition
  ) => void | Promise<void>;
  downloadDocumentationPackageJson: (
    definition: CabinetDefinition
  ) => void | Promise<void>;
}

const defaultDocumentIOPorts: CabinetStudioDocumentIOPorts = {
  downloadGlb: downloadCabinetGlb,
  downloadDocumentationCsv: downloadCabinetDocumentationCsv,
  downloadSourceDefinitionJson: downloadCabinetSourceDefinitionJson,
  downloadShopDrawingSvg: downloadCabinetShopDrawingSvg,
  downloadFabricationDxf: downloadCabinetFabricationDxf,
  downloadFabricationQuoteRequestJson: downloadCabinetFabricationQuoteRequestJson,
  downloadDocumentationPackageJson: downloadCabinetDocumentationPackageJson,
};

const exportDescriptors: Record<
  CabinetStudioExportArtifact,
  CabinetStudioExportDescriptor
> = {
  glb: {
    artifact: "glb",
    busyAction: "download",
    successMessage: "Millwork GLB exported.",
    fallbackError: "Unable to export cabinet GLB.",
  },
  documentation_csv: {
    artifact: "documentation_csv",
    busyAction: "docs",
    successMessage: "Millwork documentation exported.",
    fallbackError: "Unable to export documentation.",
  },
  source_definition_json: {
    artifact: "source_definition_json",
    busyAction: "source",
    successMessage: "Source definition exported.",
    fallbackError: "Unable to export source definition.",
  },
  shop_drawing_svg: {
    artifact: "shop_drawing_svg",
    busyAction: "shopDrawing",
    successMessage: "Shop drawing SVG exported.",
    fallbackError: "Unable to export shop drawing SVG.",
  },
  fabrication_dxf: {
    artifact: "fabrication_dxf",
    busyAction: "dxf",
    successMessage: "Fabrication DXF exported.",
    fallbackError: "Unable to export fabrication DXF.",
  },
  fabrication_rfq_json: {
    artifact: "fabrication_rfq_json",
    busyAction: "rfq",
    successMessage: "Fabrication RFQ exported.",
    fallbackError: "Unable to export fabrication RFQ.",
  },
  millwork_package_json: {
    artifact: "millwork_package_json",
    busyAction: "package",
    successMessage: "Millwork package exported.",
    fallbackError: "Unable to export millwork package.",
  },
};

export function getCabinetStudioExportDescriptor(
  artifact: CabinetStudioExportArtifact
): CabinetStudioExportDescriptor {
  return exportDescriptors[artifact];
}

export async function downloadCabinetStudioArtifact(
  definition: CabinetDefinition,
  artifact: CabinetStudioExportArtifact,
  ports: CabinetStudioDocumentIOPorts = defaultDocumentIOPorts
): Promise<CabinetStudioExportDescriptor> {
  switch (artifact) {
    case "glb":
      await ports.downloadGlb(definition);
      break;
    case "documentation_csv":
      await ports.downloadDocumentationCsv(definition);
      break;
    case "source_definition_json":
      await ports.downloadSourceDefinitionJson(definition);
      break;
    case "shop_drawing_svg":
      await ports.downloadShopDrawingSvg(definition);
      break;
    case "fabrication_dxf":
      await ports.downloadFabricationDxf(definition);
      break;
    case "fabrication_rfq_json":
      await ports.downloadFabricationQuoteRequestJson(definition);
      break;
    case "millwork_package_json":
      await ports.downloadDocumentationPackageJson(definition);
      break;
  }
  return getCabinetStudioExportDescriptor(artifact);
}

export interface CabinetStudioSourceDefinitionFile
  extends CabinetSourceImportFileInfo {
  text: () => Promise<string>;
}

export async function readCabinetStudioSourceDefinition(
  file: CabinetStudioSourceDefinitionFile
): Promise<CabinetDefinition> {
  const validation = validateCabinetSourceImportFile(file);
  if (!validation.ok) throw new Error(validation.error);
  return parseCabinetSourceDefinitionJson(await file.text());
}

export type CabinetStudioGlbExporter = (
  definition: CabinetDefinition
) => Promise<Blob>;

export async function createCabinetStudioPlacementPayload(
  definition: CabinetDefinition,
  options: {
    placeAsCopy?: boolean;
    exportGlb?: CabinetStudioGlbExporter;
    bom?: CabinetBOMItem[];
  } = {}
) {
  const glbBlob = await (options.exportGlb ?? exportCabinetAsGlb)(definition);
  return {
    definition,
    glbBlob,
    bom: options.bom ?? generateCabinetBOM(definition),
    ...(options.placeAsCopy ? { placeAsCopy: true as const } : {}),
  };
}

export interface CabinetStudioClock {
  nowIso: () => string;
  nowMs: () => number;
}

const defaultClock: CabinetStudioClock = {
  nowIso: () => new Date().toISOString(),
  nowMs: () => Date.now(),
};

export function createCabinetStudioCopyDefinition(
  definition: CabinetDefinition,
  clock: CabinetStudioClock = defaultClock
): CabinetDefinition {
  const now = clock.nowIso();
  return {
    ...definition,
    id: `cabinet-${clock.nowMs()}`,
    name: `${definition.name} copy`,
    createdAt: now,
    updatedAt: now,
  };
}
