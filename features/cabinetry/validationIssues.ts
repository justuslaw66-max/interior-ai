import { getCabinetAvailableSegments } from "./fitSegments";
import {
  getCabinetOverallDepth,
  getCabinetOverallHeight,
  getCabinetOverallWidth,
} from "./layout";
import { getRecommendedCompatibleCabinetFrontHardware } from "./hardwareCompatibility";
import type {
  CabinetDefinition,
  CabinetModuleDefinition,
  CabinetValidationAutoFix,
  CabinetValidationIssue,
  CabinetValidationIssueDraft,
  CabinetValidationTarget,
} from "./types";

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 80);
}

function friendlyField(field: string | undefined): string {
  if (!field) return "Design";
  const leaf = field.split(".").at(-1) ?? field;
  return leaf
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/^\w/, (letter) => letter.toUpperCase());
}

function inferTarget(
  definition: CabinetDefinition,
  draft: CabinetValidationIssueDraft
): CabinetValidationTarget {
  if (draft.target) return draft.target;
  const moduleMatch = /^modules\.(\d+)\.(.+)$/.exec(draft.field ?? "");
  if (moduleMatch) {
    const targetModule = definition.modules[Number(moduleMatch[1])];
    return {
      scope: "module",
      field: moduleMatch[2],
      moduleIds: targetModule ? [targetModule.id] : [],
    };
  }
  if ((draft.field ?? "").startsWith("fit") || draft.code?.startsWith("fit.")) {
    return {
      scope: "fit",
      field: draft.field,
      hostId: definition.fitState?.host.id,
    };
  }
  return { scope: "assembly", field: draft.field };
}

function inferCode(draft: CabinetValidationIssueDraft): string {
  if (draft.code) return draft.code;
  if (/Drawer stack cabinets need at least one drawer/i.test(draft.message)) return "front.drawer.count_required";
  if (/Single door cabinets need at least one door/i.test(draft.message)) return "front.door.single_count_required";
  if (/Double door cabinets need at least two doors/i.test(draft.message)) return "front.door.double_count_required";
  if (/Door leaves wider than 650 mm/i.test(draft.message)) return "front.door.leaf_too_wide";
  if (/Very tall drawer fronts/i.test(draft.message)) return "front.drawer.front_too_tall";
  if (/Very short drawer fronts/i.test(draft.message)) return "front.drawer.front_too_short";
  if (/Custom drawer heights need|custom drawer proportion/i.test(draft.message)) return "front.drawer.proportions_invalid";
  if (/Custom handle placement needs|custom handle offset moves/i.test(draft.message)) return "front.handle.offset_invalid";
  if (/internal width must be greater than zero|Module width must be positive/i.test(draft.message)) return "module.width.invalid";
  if (/Custom shelf (spacing|heights)/i.test(draft.message)) return "shelf.spacing.invalid";
  if (/Total width differs/i.test(draft.message)) return "derived.width.stale";
  if (/Overall height differs/i.test(draft.message)) return "derived.height.stale";
  if (/Overall depth differs/i.test(draft.message)) return "derived.depth.stale";
  return `validation.${slug(draft.field ?? draft.message) || "issue"}`;
}

function inferTitle(code: string, draft: CabinetValidationIssueDraft): string {
  if (draft.title) return draft.title;
  const titles: Record<string, string> = {
    "front.drawer.count_required": "Add drawers to this drawer section",
    "front.door.single_count_required": "Add a door to this cabinet",
    "front.door.double_count_required": "Add the missing door",
    "front.door.leaf_too_wide": "Door fronts are unusually wide",
    "front.drawer.front_too_tall": "Drawer fronts are unusually tall",
    "front.drawer.front_too_short": "Drawer fronts are unusually short",
    "front.drawer.proportions_invalid": "Custom drawer proportions need adjustment",
    "front.handle.offset_invalid": "A handle has moved outside its front",
    "front.hardware.unavailable": "Choose available opening hardware",
    "front.hardware.incompatible": "Choose compatible opening hardware",
    "front.hardware.review_required": "Review this opening hardware",
    "module.width.invalid": "This module is too narrow",
    "shelf.spacing.invalid": "Custom shelf heights need adjustment",
    "derived.width.stale": "Overall width needs to be refreshed",
    "derived.height.stale": "Overall height needs to be refreshed",
    "derived.depth.stale": "Overall depth needs to be refreshed",
    "fit.width.exceeded": "The design no longer fits its host",
    "fit.height.exceeded": "The design is taller than its fitted space",
    "fit.opening_conflict": "A recorded opening conflicts with the fitted segment",
    "fit.depth.exceeded": "The design projects beyond the recorded depth",
    "fit.outlet.review": "Recorded outlets need access review",
    "fit.baseboard.clearance": "Baseboard clearance is included in placement",
    "fit.mounting_height": "Wall mounting height is included in placement",
  };
  return titles[code] ?? `${friendlyField(draft.field)} needs attention`;
}

function inferResolution(code: string, draft: CabinetValidationIssueDraft): string {
  if (draft.resolution) return draft.resolution;
  const resolutions: Record<string, string> = {
    "front.drawer.count_required": "Use the suggested three-drawer layout or enter a drawer count of one or more.",
    "front.door.single_count_required": "Add one door or choose an open-front layout.",
    "front.door.double_count_required": "Use two doors or choose a different front layout.",
    "front.door.leaf_too_wide": "Add another door so each leaf is easier to hinge and keep aligned.",
    "front.drawer.front_too_tall": "Increase the drawer count or confirm heavy-duty hardware with the fabricator.",
    "front.drawer.front_too_short": "Reduce the drawer count so each front has a practical fabrication height.",
    "front.drawer.proportions_invalid": "Return to recommended heights or enter one positive proportion for every drawer.",
    "front.handle.offset_invalid": "Return to automatic placement or reduce the horizontal and vertical handle shifts.",
    "front.hardware.unavailable": "Choose an opening method already available in this design before placing or exporting.",
    "front.hardware.incompatible": "Choose an opening method marked compatible with this front layout, or change the front before placing or exporting.",
    "front.hardware.review_required": "Confirm the mounting method and front construction with the hardware supplier, or choose a fully compatible opening method.",
    "module.width.invalid": "Increase the module width or use a thinner cabinet structure.",
    "shelf.spacing.invalid": "Return to even spacing or enter one ordered in-cabinet height for every shelf.",
    "derived.width.stale": "Refresh the stored overall dimensions from the current modules and finish panels.",
    "derived.height.stale": "Refresh the stored overall dimensions from the current modules and worktop.",
    "derived.depth.stale": "Refresh the stored overall dimensions from the current modules and overhangs.",
    "fit.width.exceeded": "Refit the assembly or unlock module widths so the system can redistribute them.",
    "fit.height.exceeded": "Refit the height or reduce the assembly height below the recorded ceiling clearance.",
    "fit.opening_conflict": "Choose another wall segment or refit after reviewing the door or window location.",
    "fit.depth.exceeded": "Reduce the cabinet depth or verify that its projection leaves safe circulation.",
    "fit.outlet.review": "Confirm an accessible service opening, relocation, or approved cutout before fabrication.",
    "fit.baseboard.clearance": "Confirm the recorded offset matches the installed baseboard before placement.",
    "fit.mounting_height": "Verify the bottom elevation against room datum, adjacent worktops, and installation clearances.",
  };
  return resolutions[code] ??
    (draft.severity === "error"
      ? "Adjust the affected value to the nearest valid range before placing or exporting."
      : "Review this recommendation and confirm the condition before fabrication.");
}

function patchModuleFix(
  code: string,
  module: CabinetModuleDefinition,
  patch: Partial<CabinetModuleDefinition>,
  label: string,
  description: string
): CabinetValidationAutoFix {
  return {
    id: `${code}.${module.id}`,
    label,
    description,
    confirmation: "preview",
    action: { type: "patch_module", moduleId: module.id, patch },
  };
}

function inferFixes(
  definition: CabinetDefinition,
  code: string,
  target: CabinetValidationTarget,
  draft: CabinetValidationIssueDraft
): CabinetValidationAutoFix[] | undefined {
  if (draft.fixes?.length) return draft.fixes;
  const targetModule = target.moduleIds?.[0]
    ? definition.modules.find((candidate) => candidate.id === target.moduleIds?.[0])
    : undefined;

  if (code === "module.width.invalid" && targetModule) {
    const width = Math.max(120, definition.boardThickness * 2 + 1);
    return [patchModuleFix(code, targetModule, { width }, `Set width to ${width} mm`, `Increase ${targetModule.id} to the minimum valid width of ${width} mm.`)];
  }
  if (code === "shelf.spacing.invalid" && targetModule) {
    return [patchModuleFix(
      code,
      targetModule,
      { shelfSpacingMode: "even", shelfPositionsMm: undefined },
      "Use even shelf spacing",
      "Restore a valid evenly distributed shelf layout."
    )];
  }
  if (code === "front.drawer.count_required" && targetModule) {
    return [patchModuleFix(code, targetModule, { drawerCount: 3, drawerHeightMode: "recommended", drawerHeightProportions: undefined }, "Use three drawers", "Create a practical three-drawer starting stack with recommended proportions.")];
  }
  if (code === "front.door.single_count_required" && targetModule) {
    return [patchModuleFix(code, targetModule, { doorCount: 1 }, "Add one door", "Add the single door required by this front layout.")];
  }
  if (code === "front.door.double_count_required" && targetModule) {
    return [patchModuleFix(code, targetModule, { doorCount: 2 }, "Use two doors", "Restore a balanced two-door front layout.")];
  }
  if (code === "front.door.leaf_too_wide" && targetModule) {
    const doorCount = Math.max(1, Math.ceil(targetModule.width / 650));
    return [patchModuleFix(code, targetModule, { doorLayoutMode: "manual", doorCount }, `Use ${doorCount} doors`, `Switch to a manual split so each door leaf is no wider than about 650 mm.`)];
  }
  if ((code === "front.drawer.front_too_tall" || code === "front.drawer.front_too_short") && targetModule) {
    const usableHeight = Math.max(0, targetModule.height - definition.toeKickHeight - definition.boardThickness * 2);
    const drawerCount =
      code === "front.drawer.front_too_tall"
        ? Math.max(1, Math.ceil(usableHeight / 380))
        : Math.max(1, Math.floor(usableHeight / 90));
    return [patchModuleFix(code, targetModule, { drawerCount, drawerHeightMode: "recommended", drawerHeightProportions: undefined }, `Use ${drawerCount} drawers`, `Redistribute the drawer fronts into ${drawerCount} practical recommended heights.`)];
  }
  if (code === "front.drawer.proportions_invalid" && targetModule) {
    return [patchModuleFix(
      code,
      targetModule,
      { drawerHeightMode: "recommended", drawerHeightProportions: undefined },
      "Use recommended heights",
      "Replace the invalid custom proportions with a practical generated drawer stack."
    )];
  }
  if (code === "front.handle.offset_invalid" && targetModule) {
    return [patchModuleFix(
      code,
      targetModule,
      { handlePlacementMode: "automatic", handleOffsetX: undefined, handleOffsetY: undefined },
      "Restore automatic handles",
      "Move every generated handle back to its safe automatic position."
    )];
  }
  if (
    (code === "front.hardware.incompatible" ||
      code === "front.hardware.unavailable") &&
    targetModule
  ) {
    const replacement = getRecommendedCompatibleCabinetFrontHardware(
      targetModule,
      definition.hardware
    );
    if (!replacement) return undefined;
    return [patchModuleFix(
      code,
      targetModule,
      { hardwareId: replacement.id },
      `Use ${replacement.name}`,
      `Replace the current opening hardware with ${replacement.name}, a fully compatible option already available in this design.`
    )];
  }
  if (code.startsWith("derived.")) {
    return [{
      id: `${code}.sync`,
      label: "Refresh dimensions",
      description: "Update the stored overall dimensions from the current generated assembly.",
      confirmation: "none",
      action: { type: "sync_dimensions" },
    }];
  }
  if (code === "fit.width.exceeded" && definition.fitState) {
    return [{
      id: `${code}.resize`,
      label: "Refit width",
      description: `Resize unlocked modules to the ${Math.round(definition.fitState.segment.widthMm)} mm fitted segment.`,
      confirmation: "preview",
      action: { type: "resize_overall_width", widthMm: Math.round(definition.fitState.segment.widthMm) },
    }];
  }
  return undefined;
}

function persistedFitDrafts(definition: CabinetDefinition): CabinetValidationIssueDraft[] {
  const fit = definition.fitState;
  if (!fit) return [];
  const drafts: CabinetValidationIssueDraft[] = [];
  const fitsWidth =
    fit.mode === "fit_width" ||
    fit.mode === "fit_both" ||
    fit.mode === "between_boundaries";
  const fitsHeight = fit.mode === "fit_height" || fit.mode === "fit_both";
  if (fitsWidth && getCabinetOverallWidth(definition) > fit.segment.widthMm + 0.5) {
    drafts.push({
      code: "fit.width.exceeded",
      severity: "error",
      field: "fit.width",
      message: `The assembly is ${Math.round(getCabinetOverallWidth(definition) - fit.segment.widthMm)} mm wider than its fitted wall segment.`,
      target: { scope: "fit", field: "width", hostId: fit.host.id },
    });
  }
  const mountingHeightMm = Math.max(0, fit.host.mountingHeightMm ?? 0);
  const usableHeight =
    fit.host.availableHeightMm -
    (fit.host.installationClearanceTopMm ?? 0) -
    mountingHeightMm;
  if (fitsHeight && getCabinetOverallHeight(definition) > usableHeight + 0.5) {
    drafts.push({
      code: "fit.height.exceeded",
      severity: "error",
      field: "fit.height",
      message: `The assembly is ${Math.round(getCabinetOverallHeight(definition) - usableHeight)} mm taller than the recorded ceiling clearance.`,
      target: { scope: "fit", field: "height", hostId: fit.host.id },
    });
  }
  const availableSegments = getCabinetAvailableSegments(
    fit.host,
    getCabinetOverallHeight(definition),
    mountingHeightMm
  );
  const segmentStillAvailable = availableSegments.some(
    (segment) =>
      fit.segment.startMm >= segment.startMm - 0.5 &&
      fit.segment.endMm <= segment.endMm + 0.5
  );
  if (!segmentStillAvailable) {
    drafts.push({
      code: "fit.opening_conflict",
      severity: "error",
      field: "fit.segment",
      message: "A recorded door, window, or obstruction now overlaps the fitted wall segment.",
      target: { scope: "fit", field: "segment", hostId: fit.host.id },
    });
  }
  if (
    fit.host.availableDepthMm !== undefined &&
    getCabinetOverallDepth(definition) > fit.host.availableDepthMm + 0.5
  ) {
    drafts.push({
      code: "fit.depth.exceeded",
      severity: "warning",
      field: "fit.depth",
      message: `The assembly projects ${Math.round(getCabinetOverallDepth(definition) - fit.host.availableDepthMm)} mm beyond the recorded space depth.`,
      target: { scope: "fit", field: "depth", hostId: fit.host.id },
    });
  }
  const outletCount = fit.host.openings.filter((opening) => opening.kind === "outlet").length;
  if (outletCount > 0) {
    drafts.push({
      code: "fit.outlet.review",
      severity: "warning",
      field: "fit.outlets",
      message: `${outletCount} recorded outlet ${outletCount === 1 ? "needs" : "locations need"} an access or service-cutout decision.`,
      target: { scope: "fit", field: "outlets", hostId: fit.host.id },
    });
  }
  if ((fit.host.baseboardOffsetMm ?? 0) > 0) {
    drafts.push({
      code: "fit.baseboard.clearance",
      severity: "info",
      field: "fit.baseboardOffset",
      message: `Placement includes a ${Math.round(fit.host.baseboardOffsetMm ?? 0)} mm wall offset for the recorded baseboard.`,
      target: { scope: "fit", field: "baseboardOffset", hostId: fit.host.id },
    });
  }
  if (mountingHeightMm > 0) {
    drafts.push({
      code: "fit.mounting_height",
      severity: "info",
      field: "fit.mountingHeight",
      message: `The assembly bottom is set ${Math.round(mountingHeightMm)} mm above the room floor.`,
      target: { scope: "fit", field: "mountingHeight", hostId: fit.host.id },
    });
  }
  return drafts;
}

export function finalizeCabinetValidationIssues(
  definition: CabinetDefinition,
  drafts: CabinetValidationIssueDraft[]
): CabinetValidationIssue[] {
  const counts = new Map<string, number>();
  return [...drafts, ...persistedFitDrafts(definition)].map((draft) => {
    const code = inferCode(draft);
    const target = inferTarget(definition, draft);
    const identity = `${code}:${draft.field ?? "design"}:${target.moduleIds?.join(",") ?? ""}`;
    const occurrence = (counts.get(identity) ?? 0) + 1;
    counts.set(identity, occurrence);
    return {
      id: draft.id ?? `${slug(identity)}.${occurrence}`,
      code,
      severity: draft.severity,
      field: draft.field,
      title: inferTitle(code, draft),
      message: draft.message,
      target,
      resolution: inferResolution(code, draft),
      fixes: inferFixes(definition, code, target, draft),
    };
  });
}
