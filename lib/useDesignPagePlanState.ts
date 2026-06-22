"use client";

import { useEffect, useState } from "react";
import type { EditorAnnotation2D, FixedElement2D, RoomOpening2D } from "@/lib/editorScene";
import {
  PLAN_LAYER_PRESETS,
  type PlanLayerPresetId,
  type PlanMeasurementUnit,
} from "@/lib/design-page-types";

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
  const [planMeasurementUnit, setPlanMeasurementUnit] = useState<PlanMeasurementUnit>("mm");
  const [exportStylePreset, setExportStylePreset] = useState<ExportStylePreset>("consumer");
  const [planSettingsLoaded, setPlanSettingsLoaded] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
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
      if (storedMeasurementUnit === "mm" || storedMeasurementUnit === "cm" || storedMeasurementUnit === "in") {
        setPlanMeasurementUnit(storedMeasurementUnit);
      }

      const storedLayers = localStorage.getItem("plan_layers");
      if (storedLayers) {
        const parsed = JSON.parse(storedLayers) as Partial<PlanLayers>;
        setPlanLayers((prev) => ({ ...prev, ...parsed }));
      }

      const annotations = readPlanAnnotations(localStorage.getItem("plan_annotations"));
      if (annotations) setPlanAnnotations(annotations);

      const openings = readJsonArray<RoomOpening2D>(localStorage.getItem("plan_openings"));
      if (openings) setPlanOpenings(openings);

      const fixedElements = readJsonArray<FixedElement2D>(localStorage.getItem("plan_fixed_elements"));
      if (fixedElements) setPlanFixedElements(fixedElements);
    } catch {
      // ignore malformed storage payloads
    } finally {
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
    writeStorage("plan_annotations", JSON.stringify(planAnnotations));
  }, [planAnnotations, planSettingsLoaded]);

  useEffect(() => {
    if (!planSettingsLoaded) return;
    writeStorage("plan_openings", JSON.stringify(planOpenings));
  }, [planOpenings, planSettingsLoaded]);

  useEffect(() => {
    if (!planSettingsLoaded) return;
    writeStorage("plan_fixed_elements", JSON.stringify(planFixedElements));
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
    planSettingsLoaded,
  };
}
