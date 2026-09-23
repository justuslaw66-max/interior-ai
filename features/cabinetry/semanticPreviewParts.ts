import { getCabinetModuleStartOffset } from "./layout";
import type { CabinetDefinition, CabinetPart } from "./types";
import type { CabinetSemanticEditPreview } from "./components/CabinetSemanticEditOverlays";

function finitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function scalePartAcrossModule(
  part: CabinetPart,
  originalStartMm: number,
  originalWidthMm: number,
  previewStartMm: number,
  previewWidthMm: number
): CabinetPart {
  const scale = previewWidthMm / originalWidthMm;
  return {
    ...part,
    position: {
      ...part.position,
      x: previewStartMm + (part.position.x - originalStartMm) * scale,
    },
    size: {
      ...part.size,
      width: Math.max(0.01, part.size.width * scale),
    },
    metadata: {
      ...part.metadata,
      semanticPreview: "module_divider",
    },
  };
}

/**
 * Produces lightweight, temporary geometry data for semantic handle drags.
 * It preserves part IDs/counts and never mutates the source definition or part
 * array, so history and fabrication outputs remain tied to committed values.
 */
export function applyCabinetSemanticPreviewToParts(
  definition: CabinetDefinition,
  parts: readonly CabinetPart[],
  preview: CabinetSemanticEditPreview | null
): readonly CabinetPart[] {
  if (!preview) return parts;

  if (preview.kind === "shelf") {
    if (!Number.isFinite(preview.heightMm) || preview.shelfIndex < 0) return parts;
    let changed = false;
    const nextParts = parts.map((part) => {
      if (
        part.moduleId !== preview.moduleId ||
        part.type !== "shelf" ||
        part.metadata?.shelfIndex !== preview.shelfIndex
      ) {
        return part;
      }
      changed = true;
      return {
        ...part,
        position: { ...part.position, y: preview.heightMm },
        metadata: { ...part.metadata, semanticPreview: "shelf" },
      };
    });
    return changed ? nextParts : parts;
  }

  if (!finitePositive(preview.leftWidthMm) || !finitePositive(preview.rightWidthMm)) {
    return parts;
  }

  const leftIndex = definition.modules.findIndex(
    (module) => module.id === preview.leftModuleId
  );
  if (leftIndex < 0 || leftIndex + 1 >= definition.modules.length) return parts;
  const leftModule = definition.modules[leftIndex];
  const rightModule = definition.modules[leftIndex + 1];
  if (rightModule.id !== preview.rightModuleId) return parts;
  if (!finitePositive(leftModule.width) || !finitePositive(rightModule.width)) return parts;

  const originalPairWidthMm = leftModule.width + rightModule.width;
  const previewPairWidthMm = preview.leftWidthMm + preview.rightWidthMm;
  if (Math.abs(originalPairWidthMm - previewPairWidthMm) > 0.5) return parts;

  const leftStartMm =
    getCabinetModuleStartOffset(definition) +
    definition.modules
      .slice(0, leftIndex)
      .reduce((sum, module) => sum + module.width, 0);
  const rightStartMm = leftStartMm + leftModule.width;
  const previewRightStartMm = leftStartMm + preview.leftWidthMm;

  return parts.map((part) => {
    if (part.moduleId === leftModule.id) {
      return scalePartAcrossModule(
        part,
        leftStartMm,
        leftModule.width,
        leftStartMm,
        preview.leftWidthMm
      );
    }
    if (part.moduleId === rightModule.id) {
      return scalePartAcrossModule(
        part,
        rightStartMm,
        rightModule.width,
        previewRightStartMm,
        preview.rightWidthMm
      );
    }
    return part;
  });
}
