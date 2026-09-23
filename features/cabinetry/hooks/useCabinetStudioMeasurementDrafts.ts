"use client";

import {
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";

import {
  cabinetDisplayToMillimetres,
  cabinetMillimetresToDisplay,
  type CabinetMeasurementUnit,
} from "../measurementUnits";
import { validateCabinetNumberDraft } from "../numericInput";
import type { CabinetHostKind } from "../types";

export interface CabinetCustomSpaceDraft {
  kind: Exclude<CabinetHostKind, "wall" | "unhosted">;
  label: string;
  width: string;
  height: string;
  depth: string;
  baseboard: string;
}

interface UseCabinetStudioMeasurementDraftsInput {
  measurementUnit: CabinetMeasurementUnit;
  setMountingHeightDraft: Dispatch<SetStateAction<string>>;
  setCustomSpaceDraft: Dispatch<SetStateAction<CabinetCustomSpaceDraft>>;
}

export function convertCabinetMeasurementDraftUnit(
  draft: string,
  previousUnit: CabinetMeasurementUnit,
  nextUnit: CabinetMeasurementUnit
): string {
  const parsed = validateCabinetNumberDraft(draft);
  if (parsed.status !== "valid") return draft;
  return String(
    cabinetMillimetresToDisplay(
      cabinetDisplayToMillimetres(parsed.value, previousUnit),
      nextUnit
    )
  );
}

export function useCabinetStudioMeasurementDrafts({
  measurementUnit,
  setMountingHeightDraft,
  setCustomSpaceDraft,
}: UseCabinetStudioMeasurementDraftsInput): void {
  const previousUnitRef = useRef(measurementUnit);

  useEffect(() => {
    const previousUnit = previousUnitRef.current;
    if (previousUnit === measurementUnit) return;
    previousUnitRef.current = measurementUnit;
    const convertDraft = (draft: string) =>
      convertCabinetMeasurementDraftUnit(
        draft,
        previousUnit,
        measurementUnit
      );
    setMountingHeightDraft(convertDraft);
    setCustomSpaceDraft((current) => ({
      ...current,
      width: convertDraft(current.width),
      height: convertDraft(current.height),
      depth: convertDraft(current.depth),
      baseboard: convertDraft(current.baseboard),
    }));
  }, [measurementUnit, setCustomSpaceDraft, setMountingHeightDraft]);
}
