import type {
  CabinetBOMItem,
  CabinetDefinition,
  CabinetHostSpace,
} from "../types";

export interface CabinetryStudioProps {
  initialDefinition?: CabinetDefinition;
  availableSpaces?: CabinetHostSpace[];
  preferredSpaceId?: string | null;
  mode: "create" | "edit";
  accessLevel: "consumer" | "pro";
  onSave?: (definition: CabinetDefinition) => boolean | Promise<boolean>;
  onPlaceInPlan?: (payload: {
    definition: CabinetDefinition;
    glbBlob: Blob;
    bom: CabinetBOMItem[];
    placeAsCopy?: boolean;
  }) => boolean | Promise<boolean>;
  onCancel?: () => void;
}
