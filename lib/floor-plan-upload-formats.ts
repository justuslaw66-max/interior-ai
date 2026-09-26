/**
 * Which floor-plan files the app offers, from one capability (audit finding ST4). Everyone can
 * upload a PDF or an image; Pro (`importCad` in lib/editor-capabilities.ts) adds DXF and IFC. DWG
 * isn't offered: no DWG converter is configured (lib/floor-plan-imports/dwg-source-adapter.ts), so
 * a DWG upload could only stop in review. This is what the app offers; the server still takes what
 * it took before (capabilities are UI policy, not authorization).
 */

/** The largest upload the server takes; the same as `MAX_FLOOR_PLAN_UPLOAD_BYTES` in validation.ts. */
export const FLOOR_PLAN_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;
const MAX_SIZE_LABEL = "25 MB";

type FormatGroup = {
  names: readonly string[];
  mimeTypes: readonly string[];
  extensions: readonly string[];
};

const PDF_AND_IMAGES: FormatGroup = {
  names: ["PDF", "JPG", "PNG", "WebP"],
  mimeTypes: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
  extensions: [".pdf", ".jpg", ".jpeg", ".png", ".webp"],
};

const CAD: FormatGroup = {
  names: ["DXF", "IFC"],
  mimeTypes: [
    "application/dxf", "application/x-dxf", "image/vnd.dxf",
    "application/ifc", "application/x-ifc", "application/step", "application/x-step",
  ],
  extensions: [".dxf", ".ifc", ".ifcstep", ".step", ".stp"],
};

export const FLOOR_PLAN_CAD_NEEDS_PRO = "DXF and other CAD files need Pro.";

export type FloorPlanUploadFormats = {
  /** For the file input's `accept`. */
  accept: string;
  /** "PDF, JPG, PNG or WebP, up to 25 MB" */
  summary: string;
  /** Said to people who can't upload CAD files; null for those who can. */
  cadNote: string | null;
};

function formatGroups(importCad: boolean) {
  return importCad ? [PDF_AND_IMAGES, CAD] : [PDF_AND_IMAGES];
}

function formatNames(importCad: boolean) {
  const names = formatGroups(importCad).flatMap((group) => group.names);
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

export function floorPlanUploadFormats(importCad: boolean): FloorPlanUploadFormats {
  return {
    accept: formatGroups(importCad)
      .flatMap((group) => [...group.mimeTypes, ...group.extensions])
      .join(","),
    summary: `${formatNames(importCad)}, up to ${MAX_SIZE_LABEL}`,
    cadNote: importCad ? null : FLOOR_PLAN_CAD_NEEDS_PRO,
  };
}

function extensionOf(fileName: string) {
  const dot = fileName.lastIndexOf(".");
  return dot < 0 ? "" : fileName.slice(dot).toLowerCase();
}

function isInGroup(group: FormatGroup, file: Pick<File, "name" | "type">) {
  return (
    group.extensions.includes(extensionOf(file.name)) ||
    group.mimeTypes.includes(file.type.toLowerCase())
  );
}

/**
 * Why this file can't be uploaded, in words for the person choosing it, or null when it can. A
 * dropped file skips the input's `accept`, and the system picker can be told to show every file.
 */
export function floorPlanUploadFileProblem(
  file: Pick<File, "name" | "type" | "size">,
  importCad: boolean
): string | null {
  const names = formatNames(importCad);
  if (extensionOf(file.name) === ".dwg") {
    return `DWG files can't be read yet. Save the plan as a ${importCad ? "PDF or DXF" : "PDF"} and upload that.`;
  }
  if (!importCad && isInGroup(CAD, file)) {
    return `${FLOOR_PLAN_CAD_NEEDS_PRO} Upload a ${names} instead.`;
  }
  if (!formatGroups(importCad).some((group) => isInGroup(group, file))) {
    return `This type of file can't be uploaded. Upload a ${names}.`;
  }
  if (file.size > FLOOR_PLAN_UPLOAD_MAX_BYTES) {
    return `This file is larger than ${MAX_SIZE_LABEL}. Upload a smaller ${names}.`;
  }
  return null;
}
