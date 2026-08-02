import type { RoomSnapshot } from "@/lib/room-types";
import {
  buildCabinetAssetManifest,
  getCabinetRotationY,
  isParametricCabinetItem,
  type ParametricCabinetDesignItem,
} from "@/features/cabinetry/designItemAdapters";
import { generateCabinetBOM } from "@/features/cabinetry/generateCabinetBOM";
import { generateCabinetDocumentation } from "@/features/cabinetry/generateCabinetDocumentation";
import { generateCabinetParts } from "@/features/cabinetry/generateCabinetParts";
import {
  createCabinetMillworkDefinition,
  getCabinetMillworkAssemblyType,
} from "@/features/millwork/createCabinetMillworkDefinition";

export interface PlacedCabinetAssetMarkersProps {
  rooms: readonly Pick<RoomSnapshot, "id" | "items">[];
}

interface PlacedCabinetAssetMarkerPairProps {
  item: ParametricCabinetDesignItem;
  roomId: string;
}

function PlacedCabinetAssetMarkerPair({
  item,
  roomId,
}: PlacedCabinetAssetMarkerPairProps) {
  const rotationY = getCabinetRotationY(item);
  const position = item.position ?? item.transform?.position ?? [0, 0, 0];
  const scale = item.transform?.scale ?? [1, 1, 1];
  const assetManifest =
    item.millworkAssetManifest ??
    buildCabinetAssetManifest({
      definition: item.cabinetDefinition,
      instanceId: item.instanceId,
      roomId,
      position,
      rotationY,
      scale,
      glbAssetUrl: item.glbAssetUrl,
      createdAt: item.createdAt ?? item.cabinetDefinition.createdAt,
      updatedAt:
        item.updatedAt ?? item.cabinetUpdatedAt ?? item.cabinetDefinition.updatedAt,
    });
  let generatedParts: ReturnType<typeof generateCabinetParts> | undefined;
  const getGeneratedParts = () =>
    (generatedParts ??= generateCabinetParts(item.cabinetDefinition));
  let generatedDocumentation: ReturnType<typeof generateCabinetDocumentation> | undefined;
  const getGeneratedDocumentation = () =>
    (generatedDocumentation ??= generateCabinetDocumentation(item.cabinetDefinition, {
      parts: getGeneratedParts(),
    }));
  let generatedBom: ReturnType<typeof generateCabinetBOM> | undefined;
  const getGeneratedBom = () =>
    (generatedBom ??= generateCabinetBOM(item.cabinetDefinition, getGeneratedParts()));
  const assemblyProfile =
    item.millworkDefinition?.assemblyProfile ??
    createCabinetMillworkDefinition(item.cabinetDefinition).assemblyProfile;
  const markerProps = {
    "data-instance-id": item.instanceId,
    "data-room-id": roomId,
    "data-family": item.millworkDefinition?.family ?? "cabinetry",
    "data-assembly-type":
      item.assemblyType ?? getCabinetMillworkAssemblyType(item.cabinetDefinition),
    "data-definition-schema": item.millworkDefinition?.schema ?? "",
    "data-source-type": item.millworkDefinition?.sourceType ?? "cabinet_definition",
    "data-source-definition-id":
      item.millworkDefinition?.sourceDefinition?.id ?? item.cabinetDefinition.id,
    "data-definition-version": String(
      item.millworkDefinitionVersion ?? item.cabinetDefinition.version
    ),
    "data-asset-manifest-schema": assetManifest.schema,
    "data-asset-manifest-version": String(assetManifest.version),
    "data-asset-manifest-source-definition-version": String(
      assetManifest.sourceDefinitionVersion
    ),
    "data-generated-output-kind": assetManifest.generatedOutput.kind,
    "data-generated-output-durable": assetManifest.generatedOutput.durable
      ? "true"
      : "false",
    "data-asset-manifest-transform-position": assetManifest.transform.position.join(","),
    "data-asset-manifest-transform-rotation-y": String(
      assetManifest.transform.rotation[1]
    ),
    "data-assembly-profile-schema": assemblyProfile.schema,
    "data-assembly-profile-label": assemblyProfile.label,
    "data-assembly-profile-phase": assemblyProfile.projectPhase,
    "data-assembly-profile-placement-kind": assemblyProfile.placementKind,
    "data-assembly-profile-complexity": assemblyProfile.fabricationComplexity,
    "data-material-count": String(
      item.millworkMaterials?.length ?? item.cabinetDefinition.materials.length
    ),
    "data-hardware-count": String(
      item.millworkHardware?.length ?? item.cabinetDefinition.hardware.length
    ),
    "data-name": item.name ?? item.cabinetDefinition.name,
    "data-module-count": String(item.cabinetDefinition.modules.length),
    "data-width-mm": String(item.cabinetDefinition.totalWidth),
    "data-height-mm": String(item.cabinetDefinition.height),
    "data-depth-mm": String(item.cabinetDefinition.depth),
    "data-position": position.join(","),
    "data-rotation-y": String(rotationY),
    "data-transform-position": item.transform?.position?.join(",") ?? "",
    "data-transform-rotation-y": String(
      item.transform?.rotationY ?? item.transform?.rotation?.[1] ?? ""
    ),
    "data-bom-count": String(item.bomSnapshot?.length ?? getGeneratedBom().length),
    "data-material-schedule-count": String(
      item.materialScheduleSnapshot?.length ??
        getGeneratedDocumentation().materialSchedule.length
    ),
    "data-hardware-schedule-count": String(
      item.hardwareScheduleSnapshot?.length ??
        getGeneratedDocumentation().hardwareSchedule.length
    ),
    "data-edge-banding-schedule-count": String(
      item.edgeBandingScheduleSnapshot?.length ??
        getGeneratedDocumentation().edgeBandingSchedule.length
    ),
    "data-edge-banding-total-m": String(
      Math.round(
        (
          item.edgeBandingScheduleSnapshot ??
          getGeneratedDocumentation().edgeBandingSchedule
        ).reduce((sum, entry) => sum + entry.totalLengthM, 0) * 100
      ) / 100
    ),
    "data-cut-list-count": String(
      item.cutListSnapshot?.length ?? getGeneratedDocumentation().cutList.length
    ),
    "data-dimension-schedule-count": String(
      item.dimensionScheduleSnapshot?.length ??
        getGeneratedDocumentation().dimensionSchedule.length
    ),
    "data-drawing-view-schedule-count": String(
      item.drawingViewScheduleSnapshot?.length ??
        getGeneratedDocumentation().drawingViewSchedule.length
    ),
    "data-installer-note-count": String(
      item.installerNotesSnapshot?.length ??
        getGeneratedDocumentation().installerNotes.length
    ),
    "data-release-checklist-count": String(
      item.releaseChecklistSnapshot?.length ??
        getGeneratedDocumentation().releaseChecklist.length
    ),
    "data-release-blocker-count": String(
      (
        item.releaseChecklistSnapshot ??
        getGeneratedDocumentation().releaseChecklist
      ).filter((entry) => entry.status === "blocked").length
    ),
    "data-quote-total": String(
      item.quoteSummarySnapshot?.estimatedTotal ??
        getGeneratedDocumentation().quoteSummary.estimatedTotal
    ),
    "data-quote-line-count": String(
      item.quoteSummarySnapshot?.lineItems.length ??
        getGeneratedDocumentation().quoteSummary.lineItems.length
    ),
    "data-supplier-sku-mapping-count": String(
      item.supplierSkuMappingsSnapshot?.length ??
        getGeneratedDocumentation().supplierSkuMappings.length
    ),
    "data-supplier-readiness-status":
      item.supplierReadinessSnapshot?.status ??
      getGeneratedDocumentation().supplierReadiness.status,
    "data-mapped-sku-count": String(
      item.supplierReadinessSnapshot?.mappedSkuCount ??
        getGeneratedDocumentation().supplierReadiness.mappedSkuCount
    ),
    "data-missing-sku-count": String(
      item.supplierReadinessSnapshot?.missingSkuCount ??
        getGeneratedDocumentation().supplierReadiness.missingSkuCount
    ),
    "data-custom-quote-required-count": String(
      item.supplierReadinessSnapshot?.customQuoteRequiredCount ??
        getGeneratedDocumentation().supplierReadiness.customQuoteRequiredCount
    ),
    "data-fabrication-release-status":
      item.fabricationReleaseReadinessSnapshot?.status ??
      getGeneratedDocumentation().fabricationReleaseReadiness.status,
    "data-fabrication-release-required-count": String(
      item.fabricationReleaseReadinessSnapshot?.requiredGateCount ??
        getGeneratedDocumentation().fabricationReleaseReadiness.requiredGateCount
    ),
    "data-fabrication-release-blocker-count": String(
      item.fabricationReleaseReadinessSnapshot?.blockerCount ??
        getGeneratedDocumentation().fabricationReleaseReadiness.blockerCount
    ),
  };

  return (
    <>
      <div data-testid="placed-millwork-asset" {...markerProps} />
      <div data-testid="placed-cabinet-asset" {...markerProps} />
    </>
  );
}

export function PlacedCabinetAssetMarkers({ rooms }: PlacedCabinetAssetMarkersProps) {
  return (
    <div data-testid="placed-cabinet-assets" hidden>
      {rooms.flatMap((room) =>
        room.items.filter(isParametricCabinetItem).map((item) => (
          <PlacedCabinetAssetMarkerPair
            key={`${room.id}:${item.instanceId}`}
            item={item}
            roomId={item.roomId ?? room.id}
          />
        ))
      )}
    </div>
  );
}
