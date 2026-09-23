export const CABINET_SOURCE_IMPORT_LIMITS = {
  maxBytes: 2 * 1024 * 1024,
  allowedMimeTypes: ["", "application/json", "text/json"] as const,
} as const;

export type CabinetSourceImportFileInfo = {
  name: string;
  size: number;
  type: string;
};

export function validateCabinetSourceImportFile(file: CabinetSourceImportFileInfo) {
  if (!file.name.toLowerCase().endsWith(".json")) {
    return { ok: false as const, error: "Choose a .json source definition file." };
  }
  if (
    !Number.isFinite(file.size) ||
    file.size <= 0 ||
    file.size > CABINET_SOURCE_IMPORT_LIMITS.maxBytes
  ) {
    return {
      ok: false as const,
      error: "Source definition files must be non-empty and no larger than 2 MB.",
    };
  }
  if (
    !CABINET_SOURCE_IMPORT_LIMITS.allowedMimeTypes.includes(
      file.type as (typeof CABINET_SOURCE_IMPORT_LIMITS.allowedMimeTypes)[number]
    )
  ) {
    return { ok: false as const, error: "Source definition must be JSON." };
  }
  return { ok: true as const };
}
