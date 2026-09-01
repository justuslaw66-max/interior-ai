"use client";

import { useEffect, useState } from "react";
import type { EditorAnnotation2D, FixedElement2D, RoomOpening2D } from "@/lib/editorScene";
import {
  PLAN_LAYER_PRESETS,
  type PlanLayerPresetId,
  type PlanMeasurementUnit,
} from "@/lib/design-page-types";
import {
  DEFAULT_DISPLAY_UNIT,
  normalizeDisplayUnit,
} from "@/lib/display-units";

export type PlanTheme = "consumer" | "pro";
export type ExportStylePreset = "consumer" | "pro";
export type PlanLayers = typeof PLAN_LAYER_PRESETS.presentation.layers;

function readPlanAnnotations(value: string | null): EditorAnnotation2D[] | null {
  if (!value) return null;

  const parsed = JSON.parse(value) as Array<
    Partial<EditorAnnotation2D> & {
      id?: string;
      xMm?: number;
      zMm?: number;
      text?: string;
    }
  >;
  if (!Array.isArray(parsed)) return null;

  const normalized: EditorAnnotation2D[] = [];
  for (let i = 0; i < parsed.length; i += 1) {
    const entry = parsed[i];
    if (typeof entry.id !== "string" || typeof entry.xMm !== "number" || typeof entry.zMm !== "number") {
      continue;
    }
    const kind: EditorAnnotation2D["kind"] =
      entry.kind === "callout" || entry.kind === "room_tag" ? entry.kind : "note";
    normalized.push({
      id: entry.id || `note-${i}`,
      xMm: Number(entry.xMm),
      zMm: Number(entry.zMm),
      text: String(entry.text ?? "Note"),
      kind,
      anchorXMm: typeof entry.anchorXMm === "number" ? entry.anchorXMm : undefined,
      anchorZMm: typeof entry.anchorZMm === "number" ? entry.anchorZMm : undefined,
    });
  }

  return normalized;
}

function readJsonArray<T>(value: string | null): T[] | null {
  if (!value) return null;
  const parsed = JSON.parse(value) as T[];
  return Array.isArray(parsed) ? parsed : null;
}

function sanitizePlanFixedElements(fixedElements: FixedElement2D[]) {
  return fixedElements.filter((fixed) => {
    const label = fixed.label?.trim().toLowerCase() ?? "";
    return fixed.kind !== "kitchen_counter" && fixed.kind !== "island" && label !== "kitchen run";
  });
}

function writeStorage(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore storage errors
  }
}

export function useDesignPagePlanState() {
  const [planTheme, setPlanTheme] = useState<PlanTheme>("consumer");
  const [planLayers, setPlanLayers] = useState<PlanLayers>({
    ...PLAN_LAYER_PRESETS.presentation.layers,
  });
  const [planAnnotations, setPlanAnnotations] = useState<EditorAnnotation2D[]>([]);
  const [planOpenings, setPlanOpenings] = useState<RoomOpening2D[]>([]);
  const [planFixedElements, setPlanFixedElements] = useState<FixedElement2D[]>([]);
  const [simplePlanControls, setSimplePlanControls] = useState(true);
  const [planLayerPreset, setPlanLayerPreset] = useState<PlanLayerPresetId>("presentation");
  const [planMeasurementUnit, setPlanMeasurementUnit] = useState<PlanMeasurementUnit>(DEFAULT_DISPLAY_UNIT);
  const [exportStylePreset, setExportStylePreset] = useState<ExportStylePreset>("consumer");
  const [planGuidedActionsEnabled, setPlanGuidedActionsEnabled] = useState(true);
  const [planGuidedActionsChoiceSeen, setPlanGuidedActionsChoiceSeen] = useState(false);
  const [planSettingsLoaded, setPlanSettingsLoaded] = useState(false);
  const [planOpeningsStorageState, setPlanOpeningsStorageState] =
    useState<"pending" | "missing" | "present">("pending");

  useEffect(() => {
    if (typeof window === "undefined") return;
    let openingsStorageState: "missing" | "present" = "missing";
    try {
      const storedTheme = localStorage.getItem("plan_theme");
      if (storedTheme === "consumer" || storedTheme === "pro") {
        setPlanTheme(storedTheme);
      }

      const storedLayerPreset = localStorage.getItem("plan_layer_preset");
      if (storedLayerPreset === "presentation" || storedLayerPreset === "technical" || storedLayerPreset === "staging") {
        setPlanLayerPreset(storedLayerPreset);
      }

      const storedExportPreset = localStorage.getItem("plan_export_preset");
      if (storedExportPreset === "consumer" || storedExportPreset === "pro") {
        setExportStylePreset(storedExportPreset);
      }

      const storedMeasurementUnit = localStorage.getItem("plan_measurement_unit");
      setPlanMeasurementUnit(normalizeDisplayUnit(storedMeasurementUnit));

      const storedGuidedActions = localStorage.getItem("plan_guided_actions");
      if (storedGuidedActions === "0") {
        setPlanGuidedActionsEnabled(false);
      } else if (storedGuidedActions === "1") {
        setPlanGuidedActionsEnabled(true);
      }

      setPlanGuidedActionsChoiceSeen(
        localStorage.getItem("plan_guided_actions_choice_seen") === "1"
      );

      const storedLayers = localStorage.getItem("plan_layers");
      if (storedLayers) {
        const parsed = JSON.parse(storedLayers) as Partial<PlanLayers>;
        setPlanLayers((prev) => ({ ...prev, ...parsed }));
      }

      const annotations = readPlanAnnotations(localStorage.getItem("plan_annotations"));
      if (annotations) setPlanAnnotations(annotations);

      const storedOpenings = localStorage.getItem("plan_openings");
      openingsStorageState = storedOpenings === null ? "missing" : "present";
      const openings = readJsonArray<RoomOpening2D>(storedOpenings);
      if (openings) setPlanOpenings(openings);

      const fixedElements = readJsonArray<FixedElement2D>(localStorage.getItem("plan_fixed_elements"));
      if (fixedElements) setPlanFixedElements(sanitizePlanFixedElements(fixedElements));
    } catch {
      // ignore malformed storage payloads
    } finally {
      setPlanOpeningsStorageState(openingsStorageState);
      setPlanSettingsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!planSettingsLoaded) return;
    writeStorage("plan_theme", planTheme);
  }, [planSettingsLoaded, planTheme]);

  useEffect(() => {
    if (!planSettingsLoaded) return;
    writeStorage("plan_layers", JSON.stringify(planLayers));
  }, [planLayers, planSettingsLoaded]);

  useEffect(() => {
    if (!planSettingsLoaded) return;
    writeStorage("plan_layer_preset", planLayerPreset);
  }, [planLayerPreset, planSettingsLoaded]);

  useEffect(() => {
    if (!planSettingsLoaded) return;
    writeStorage("plan_measurement_unit", planMeasurementUnit);
  }, [planMeasurementUnit, planSettingsLoaded]);

  useEffect(() => {
    if (!planSettingsLoaded) return;
    writeStorage("plan_export_preset", exportStylePreset);
  }, [exportStylePreset, planSettingsLoaded]);

  useEffect(() => {
    if (!planSettingsLoaded) return;
    writeStorage("plan_guided_actions", planGuidedActionsEnabled ? "1" : "0");
  }, [planGuidedActionsEnabled, planSettingsLoaded]);

  useEffect(() => {
    if (!planSettingsLoaded) return;
    writeStorage("plan_guided_actions_choice_seen", planGuidedActionsChoiceSeen ? "1" : "0");
  }, [planGuidedActionsChoiceSeen, planSettingsLoaded]);

  useEffect(() => {
    if (!planSettingsLoaded) return;
    writeStorage("plan_annotations", JSON.stringify(planAnnotations));
  }, [planAnnotations, planSettingsLoaded]);

  useEffect(() => {
    if (!planSettingsLoaded) return;
    writeStorage("plan_openings", JSON.stringify(planOpenings));
  }, [planOpenings, planSettingsLoaded]);

  useEffect(() => {
    if (!planSettingsLoaded) return;
    const sanitized = sanitizePlanFixedElements(planFixedElements);
    if (sanitized.length !== planFixedElements.length) {
      setPlanFixedElements(sanitized);
      return;
    }
    writeStorage("plan_fixed_elements", JSON.stringify(sanitized));
  }, [planFixedElements, planSettingsLoaded]);

  return {
    planTheme,
    setPlanTheme,
    planLayers,
    setPlanLayers,
    planAnnotations,
    setPlanAnnotations,
    planOpenings,
    setPlanOpenings,
    planFixedElements,
    setPlanFixedElements,
    simplePlanControls,
    setSimplePlanControls,
    planLayerPreset,
    setPlanLayerPreset,
    planMeasurementUnit,
    setPlanMeasurementUnit,
    exportStylePreset,
    setExportStylePreset,
    planGuidedActionsEnabled,
    setPlanGuidedActionsEnabled,
    planGuidedActionsChoiceSeen,
    setPlanGuidedActionsChoiceSeen,
    planOpeningsStorageState,
    planSettingsLoaded,
    planMeasurementUnitReady: planSettingsLoaded,
  };
}
