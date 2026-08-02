import type { CabinetTemplateHost } from "./presets";
import type { CabinetHostSpace } from "./types";

export type CabinetTemplateHostCompatibilityStatus =
  | "compatible"
  | "review_required"
  | "incompatible";

export interface CabinetTemplateHostCompatibility {
  status: CabinetTemplateHostCompatibilityStatus;
  requiredHostType: CabinetTemplateHost;
  supportedHostTypes: CabinetTemplateHost[];
  message: string;
  suggestedAction?: "choose_another_space" | "create_without_host" | "review_support";
}

export function getCabinetSpaceSupportedTemplateHosts(
  space: CabinetHostSpace
): CabinetTemplateHost[] {
  if (space.kind === "unhosted") return ["Flexible"];
  if (space.kind === "rectangular_area") {
    return ["Floor", "Wall", "Ceiling", "Flexible"];
  }
  // A measured wall, niche, or opening can provide the rear boundary for
  // either floor-supported or wall-mounted built-ins.
  return ["Floor", "Wall", "Flexible"];
}

export function resolveCabinetTemplateHostCompatibility(
  requiredHostType: CabinetTemplateHost,
  space: CabinetHostSpace
): CabinetTemplateHostCompatibility {
  const supportedHostTypes = getCabinetSpaceSupportedTemplateHosts(space);
  if (requiredHostType === "Flexible") {
    return {
      status: "compatible",
      requiredHostType,
      supportedHostTypes,
      message: `${space.label} can host this flexible millwork template.`,
    };
  }
  if (supportedHostTypes.includes(requiredHostType)) {
    return {
      status: "compatible",
      requiredHostType,
      supportedHostTypes,
      message:
        requiredHostType === "Floor" && space.kind === "wall"
          ? `${space.label} supplies the fitting boundary; the assembly remains supported by the floor.`
          : `${space.label} supports the template's ${requiredHostType.toLowerCase()} placement.`,
    };
  }
  if (requiredHostType === "Ceiling") {
    return {
      status: "incompatible",
      requiredHostType,
      supportedHostTypes,
      message: `${space.label} is not a measured ceiling area. Choose a ceiling area or create the design without a host.`,
      suggestedAction: "choose_another_space",
    };
  }
  return {
    status: "review_required",
    requiredHostType,
    supportedHostTypes,
    message: `${space.label} does not confirm ${requiredHostType.toLowerCase()} support. Review the support condition or create without a host.`,
    suggestedAction: "review_support",
  };
}
