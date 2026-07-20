import type { CabinetDefinition, CabinetModuleDefinition } from "../types";

export type {
  CabinetHistoryEntry,
  CabinetTemplateSourceIdentity,
} from "../state/CabinetStudioHistory";

export type SpecialtyNumberFieldDefinition = {
  field: Extract<keyof CabinetModuleDefinition, string>;
  label: string;
  testId: string;
  step: number;
  min?: number;
  max?: number;
};

export interface SavedCabinetTemplate {
  id: string;
  name: string;
  savedAt: string;
  definition: CabinetDefinition;
}
