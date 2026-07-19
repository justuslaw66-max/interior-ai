import { RegisteredCadSourceAdapter } from "./cad-source-adapter";
import { CAD_SOURCE_LIMITS, CadSourceLimitError, CadSourceParseError } from "./cad-types";
import { DXF_PARSER_VERSION, parseAsciiDxf } from "./dxf-parser";
import { IFC_PARSER_VERSION, parseIfcStep } from "./ifc-parser";

export const DWG_MIME_TYPES = [
  "application/acad",
  "application/autocad_dwg",
  "application/dwg",
  "application/x-acad",
  "application/x-dwg",
  "image/vnd.dwg",
] as const;

export type DwgConversionResult = {
  format: "dxf" | "ifc";
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
};

/**
 * Deliberate trust boundary for proprietary DWG decoding. The application does
 * not pretend to parse DWG natively; deployments must inject an audited
 * converter and retain its identity/version in extraction provenance.
 */
export interface DwgConversionProvider {
  readonly id: string;
  readonly version: string;
  convert(input: {
    fileName: string;
    mimeType: string;
    sha256: string;
    bytes: Uint8Array;
    signal?: AbortSignal;
  }): Promise<DwgConversionResult>;
}

function validateConversion(result: DwgConversionResult) {
  if (!(result.bytes instanceof Uint8Array) || result.bytes.byteLength < 1) {
    throw new CadSourceParseError("DWG conversion provider returned no bytes");
  }
  if (result.bytes.byteLength > CAD_SOURCE_LIMITS.maxBytes) {
    throw new CadSourceLimitError("DWG conversion output exceeds the CAD parser byte limit");
  }
  const extension = result.fileName.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
  const mimeType = result.mimeType.trim().toLowerCase();
  if (
    result.fileName.length > 180 ||
    mimeType.length > 80 ||
    !mimeType
  ) {
    throw new CadSourceParseError("DWG converter returned invalid output metadata");
  }
  if (
    result.format === "dxf" &&
    (extension !== ".dxf" || !["application/dxf", "application/x-dxf", "image/vnd.dxf"].includes(mimeType))
  ) {
    throw new CadSourceParseError("DWG converter declared DXF but returned a mismatched file name");
  }
  if (
    result.format === "ifc" &&
    (
      ![".ifc", ".ifcstep", ".step", ".stp"].includes(extension) ||
      !["application/ifc", "application/x-ifc", "application/step", "application/x-step"].includes(mimeType)
    )
  ) {
    throw new CadSourceParseError("DWG converter declared IFC but returned a mismatched file name");
  }
  return result;
}

export class DwgFloorPlanSourceAdapter extends RegisteredCadSourceAdapter {
  constructor(provider?: DwgConversionProvider) {
    if (
      provider &&
      (
        !provider.id.trim() ||
        provider.id.length > 160 ||
        !provider.version.trim() ||
        provider.version.length > 160
      )
    ) {
      throw new CadSourceParseError("DWG conversion provider identity and version are required");
    }
    super({
      id: provider
        ? `dwg-conversion-${provider.id.replace(/[^A-Za-z0-9_.:-]+/g, "-")}`
        : "dwg-conversion-unavailable",
      extractionVersion: provider
        ? `dwg-provider-${provider.version}+cad-1.0.0`
        : "dwg-provider-required-1.0.0",
      format: "dxf",
      mimeTypes: DWG_MIME_TYPES,
      extensions: [".dwg"],
      async parse(source, context) {
        if (!provider) {
          throw new CadSourceParseError(
            "DWG requires a configured conversion provider; native DWG parsing is intentionally unavailable"
          );
        }
        if (context.signal?.aborted) throw context.signal.reason ?? new Error("DWG conversion aborted");
        const converted = validateConversion(
          await provider.convert({
            fileName: source.fileName,
            mimeType: source.mimeType,
            sha256: source.sha256,
            bytes: source.bytes,
            signal: context.signal,
          })
        );
        if (context.signal?.aborted) throw context.signal.reason ?? new Error("DWG conversion aborted");
        const parsed = converted.format === "dxf"
          ? parseAsciiDxf(converted.bytes)
          : parseIfcStep(converted.bytes);
        return {
          ...parsed,
          parserVersion: converted.format === "dxf"
            ? `${DXF_PARSER_VERSION}+dwg-${provider.version}`
            : `${IFC_PARSER_VERSION}+dwg-${provider.version}`,
          conversion: {
            providerId: provider.id,
            providerVersion: provider.version,
            sourceFormat: "dwg",
            outputFormat: converted.format,
          },
          warnings: [
            ...parsed.warnings,
            `DWG coordinates were decoded by conversion provider ${provider.id} ${provider.version}`,
          ],
        };
      },
    });
  }
}
