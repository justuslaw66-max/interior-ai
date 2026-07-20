import {
  getCabinetCeilingBeamCount,
  getCabinetCeilingBeamDepth,
  getCabinetCeilingBeamWidth,
  getCabinetCeilingGridColumnCount,
  getCabinetCeilingGridRowCount,
} from "../ceilingBeamLayout";
import {
  getCabinetConvertibleHingeHeight,
  getCabinetConvertibleOpenDepth,
  getCabinetConvertiblePanelHeight,
  getCabinetConvertiblePanelThickness,
  getCabinetConvertibleSupportLegCount,
  getCabinetConvertibleSupportLegDepth,
  getCabinetConvertibleSupportLegWidth,
} from "../convertibleLayout";
import {
  CABINET_PRESET_OPTIONS,
  getCabinetPresetMillworkAssemblyType,
  type CabinetPresetId,
} from "../presets";
import {
  getCabinetFireplaceHeaderHeight,
  getCabinetFireplaceLegWidth,
  getCabinetFireplaceMantelDepth,
  getCabinetFireplaceMantelHeight,
  getCabinetFireplaceOpeningHeight,
  getCabinetFireplaceOpeningWidth,
  getCabinetTrimMemberCount,
  getCabinetTrimMiterAngle,
  getCabinetTrimProfileDepth,
  getCabinetTrimProfileWidth,
  getCabinetTrimReturnDepth,
  getCabinetTrimSetoutHeight,
} from "../trimLayout";
import type {
  CabinetDefinition,
  CabinetFrontType,
  CabinetMillworkComponentType,
  CabinetModuleDefinition,
} from "../types";
import type { SpecialtyNumberFieldDefinition } from "./CabinetryStudio.types";

export { cabinetShelfLayoutParameterPath } from "../shelfLayout";

export function cabinetPresetIdFromDefinition(
  definition?: CabinetDefinition
): CabinetPresetId | null {
  if (!definition) return null;
  const sourcePresetId = definition.sourcePresetId;
  if (
    sourcePresetId &&
    CABINET_PRESET_OPTIONS.some((preset) => preset.id === sourcePresetId)
  ) {
    return sourcePresetId as CabinetPresetId;
  }
  const normalizedName = definition.name.trim().toLowerCase();
  const nameMatch = CABINET_PRESET_OPTIONS.find(
    (preset) => preset.label.trim().toLowerCase() === normalizedName
  );
  if (nameMatch) return nameMatch.id;
  if (!definition.millworkAssemblyType) return null;
  const assemblyMatches = CABINET_PRESET_OPTIONS.filter(
    (preset) =>
      getCabinetPresetMillworkAssemblyType(preset.id) ===
      definition.millworkAssemblyType
  );
  return assemblyMatches.length === 1 ? assemblyMatches[0].id : null;
}

export function getSpecialtyNumberFields(
  componentType: CabinetMillworkComponentType
): SpecialtyNumberFieldDefinition[] {
  if (
    componentType === "ceiling_beam_array" ||
    componentType === "coffered_ceiling_grid"
  ) {
    return [
      ...(componentType === "ceiling_beam_array"
        ? [
            {
              field: "ceilingBeamCount",
              label: "Beam count",
              testId: "cabinet-input-ceiling-beams",
              step: 1,
            },
          ] satisfies SpecialtyNumberFieldDefinition[]
        : []),
      {
        field: "ceilingBeamWidth",
        label: "Beam width",
        testId: "cabinet-input-ceiling-beam-width",
        step: 1,
      },
      {
        field: "ceilingBeamDepth",
        label: "Beam depth",
        testId: "cabinet-input-ceiling-beam-depth",
        step: 1,
      },
      ...(componentType === "coffered_ceiling_grid"
        ? [
            {
              field: "ceilingGridColumnCount",
              label: "Grid columns",
              testId: "cabinet-input-ceiling-grid-columns",
              step: 1,
            },
            {
              field: "ceilingGridRowCount",
              label: "Grid rows",
              testId: "cabinet-input-ceiling-grid-rows",
              step: 1,
            },
          ] satisfies SpecialtyNumberFieldDefinition[]
        : []),
    ];
  }
  if (componentType === "trim_run") {
    return [
      {
        field: "trimMemberCount",
        label: "Trim pieces",
        testId: "cabinet-input-trim-members",
        step: 1,
      },
      {
        field: "trimProfileWidth",
        label: "Profile width",
        testId: "cabinet-input-trim-profile-width",
        step: 1,
      },
      {
        field: "trimProfileDepth",
        label: "Profile depth",
        testId: "cabinet-input-trim-profile-depth",
        step: 1,
      },
      {
        field: "trimSetoutHeight",
        label: "Installation height",
        testId: "cabinet-input-trim-setout-height",
        step: 10,
      },
      {
        field: "trimReturnDepth",
        label: "Return depth",
        testId: "cabinet-input-trim-return-depth",
        step: 5,
      },
      {
        field: "trimMiterAngle",
        label: "Miter angle",
        testId: "cabinet-input-trim-miter-angle",
        step: 1,
        min: 1,
        max: 89,
      },
    ];
  }
  if (componentType === "fireplace_surround_frame") {
    return [
      {
        field: "fireplaceOpeningWidth",
        label: "Opening width",
        testId: "cabinet-input-fireplace-opening-width",
        step: 10,
      },
      {
        field: "fireplaceOpeningHeight",
        label: "Opening height",
        testId: "cabinet-input-fireplace-opening-height",
        step: 10,
      },
      {
        field: "fireplaceLegWidth",
        label: "Leg width",
        testId: "cabinet-input-fireplace-leg-width",
        step: 10,
      },
      {
        field: "fireplaceHeaderHeight",
        label: "Header height",
        testId: "cabinet-input-fireplace-header-height",
        step: 10,
      },
      {
        field: "fireplaceMantelHeight",
        label: "Mantel height",
        testId: "cabinet-input-fireplace-mantel-height",
        step: 10,
      },
      {
        field: "fireplaceMantelDepth",
        label: "Mantel depth",
        testId: "cabinet-input-fireplace-mantel-depth",
        step: 10,
      },
    ];
  }
  return [
    {
      field: "convertiblePanelThickness",
      label: "Panel thickness",
      testId: "cabinet-input-convertible-panel-thickness",
      step: 1,
    },
    {
      field: "convertiblePanelHeight",
      label: "Panel height",
      testId: "cabinet-input-convertible-panel-height",
      step: 10,
    },
    {
      field: "convertibleOpenDepth",
      label: "Open depth",
      testId: "cabinet-input-convertible-open-depth",
      step: 10,
    },
    {
      field: "convertibleHingeHeight",
      label: "Hinge height",
      testId: "cabinet-input-convertible-hinge-height",
      step: 10,
    },
    {
      field: "convertibleSupportLegCount",
      label: "Support legs",
      testId: "cabinet-input-convertible-support-legs",
      step: 1,
    },
    {
      field: "convertibleSupportLegWidth",
      label: "Leg width",
      testId: "cabinet-input-convertible-support-leg-width",
      step: 1,
    },
    {
      field: "convertibleSupportLegDepth",
      label: "Leg depth",
      testId: "cabinet-input-convertible-support-leg-depth",
      step: 1,
    },
  ];
}

export function getSpecialtyNumberValue(
  module: CabinetModuleDefinition,
  field: SpecialtyNumberFieldDefinition["field"]
): number {
  if (field === "ceilingBeamCount") return getCabinetCeilingBeamCount(module);
  if (field === "ceilingBeamWidth") return getCabinetCeilingBeamWidth(module);
  if (field === "ceilingBeamDepth") return getCabinetCeilingBeamDepth(module);
  if (field === "ceilingGridColumnCount") {
    return getCabinetCeilingGridColumnCount(module);
  }
  if (field === "ceilingGridRowCount") return getCabinetCeilingGridRowCount(module);
  if (field === "trimMemberCount") return getCabinetTrimMemberCount(module);
  if (field === "trimProfileWidth") return getCabinetTrimProfileWidth(module);
  if (field === "trimProfileDepth") return getCabinetTrimProfileDepth(module);
  if (field === "trimSetoutHeight") return getCabinetTrimSetoutHeight(module);
  if (field === "trimReturnDepth") return getCabinetTrimReturnDepth(module);
  if (field === "trimMiterAngle") return getCabinetTrimMiterAngle(module);
  if (field === "fireplaceOpeningWidth") {
    return getCabinetFireplaceOpeningWidth(module);
  }
  if (field === "fireplaceOpeningHeight") {
    return getCabinetFireplaceOpeningHeight(module);
  }
  if (field === "fireplaceLegWidth") return getCabinetFireplaceLegWidth(module);
  if (field === "fireplaceHeaderHeight") {
    return getCabinetFireplaceHeaderHeight(module);
  }
  if (field === "fireplaceMantelHeight") {
    return getCabinetFireplaceMantelHeight(module);
  }
  if (field === "fireplaceMantelDepth") {
    return getCabinetFireplaceMantelDepth(module);
  }
  if (field === "convertiblePanelThickness") {
    return getCabinetConvertiblePanelThickness(module);
  }
  if (field === "convertiblePanelHeight") {
    return getCabinetConvertiblePanelHeight(module);
  }
  if (field === "convertibleOpenDepth") {
    return getCabinetConvertibleOpenDepth(module);
  }
  if (field === "convertibleHingeHeight") {
    return getCabinetConvertibleHingeHeight(module);
  }
  if (field === "convertibleSupportLegCount") {
    return getCabinetConvertibleSupportLegCount(module);
  }
  if (field === "convertibleSupportLegWidth") {
    return getCabinetConvertibleSupportLegWidth(module);
  }
  if (field === "convertibleSupportLegDepth") {
    return getCabinetConvertibleSupportLegDepth(module);
  }
  const value = module[field];
  return typeof value === "number" ? value : 0;
}

export function guidedFrontPatch(
  frontType: CabinetFrontType
): Partial<CabinetModuleDefinition> {
  const automaticFrontDefaults = {
    doorLayoutMode: "recommended" as const,
    drawerHeightMode: "recommended" as const,
    drawerHeightProportions: undefined,
  };
  if (frontType === "open") {
    return { ...automaticFrontDefaults, frontType, doorCount: 0, drawerCount: 0 };
  }
  if (frontType === "single_door") {
    return {
      ...automaticFrontDefaults,
      frontType,
      doorCount: 1,
      drawerCount: 0,
      hingeSide: "left",
    };
  }
  if (frontType === "double_door") {
    return {
      ...automaticFrontDefaults,
      frontType,
      doorCount: 2,
      drawerCount: 0,
      hingeSide: "double",
    };
  }
  if (frontType === "drawer_stack") {
    return { ...automaticFrontDefaults, frontType, doorCount: 0, drawerCount: 3 };
  }
  if (frontType === "door_and_drawer") {
    return {
      ...automaticFrontDefaults,
      frontType,
      doorCount: 2,
      drawerCount: 1,
      hingeSide: "double",
    };
  }
  return { ...automaticFrontDefaults, frontType, doorCount: 1, drawerCount: 0 };
}
