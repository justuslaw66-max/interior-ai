"use client";

import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import type { CabinetSemanticSelection } from "../components/CabinetSceneItem";
import type { CabinetDefinition } from "../types";

export interface CabinetStudioSelectionController {
  activeModuleId: string;
  setActiveModuleId: Dispatch<SetStateAction<string>>;
  semanticSelection: CabinetSemanticSelection;
  setSemanticSelection: Dispatch<SetStateAction<CabinetSemanticSelection>>;
  selectStudioModule: (moduleId: string) => void;
  selectSemanticPreview: (selection: CabinetSemanticSelection) => void;
}

export function reconcileCabinetStudioSelection(
  current: CabinetSemanticSelection,
  definition: CabinetDefinition,
  activeModuleId: string,
  generatedPartIds: ReadonlySet<string>
): CabinetSemanticSelection {
  const moduleStillExists =
    !current.moduleId ||
    definition.modules.some((module) => module.id === current.moduleId);
  const partStillExists =
    !current.partId || generatedPartIds.has(current.partId);
  if (
    current.cabinetDefinitionId === definition.id &&
    moduleStillExists &&
    partStillExists
  ) {
    return current;
  }

  const fallbackModuleId = definition.modules.some(
    (module) => module.id === activeModuleId
  )
    ? activeModuleId
    : definition.modules[0]?.id;
  return {
    scope: fallbackModuleId ? "module" : "assembly",
    cabinetDefinitionId: definition.id,
    moduleId: fallbackModuleId,
    additive: false,
  };
}

export function useCabinetStudioSelectionController(
  definition: CabinetDefinition,
  generatedPartIds: ReadonlySet<string>
): CabinetStudioSelectionController {
  const [activeModuleId, setActiveModuleId] = useState(
    definition.modules[0]?.id ?? ""
  );
  const [semanticSelection, setSemanticSelection] =
    useState<CabinetSemanticSelection>(() => ({
      scope: definition.modules[0] ? "module" : "assembly",
      cabinetDefinitionId: definition.id,
      moduleId: definition.modules[0]?.id,
      additive: false,
    }));

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setSemanticSelection((current) =>
        reconcileCabinetStudioSelection(
          current,
          definition,
          activeModuleId,
          generatedPartIds
        )
      );
    });
    return () => {
      cancelled = true;
    };
  }, [activeModuleId, definition, generatedPartIds]);

  const selectStudioModule = useCallback(
    (moduleId: string) => {
      setActiveModuleId(moduleId);
      setSemanticSelection({
        scope: "module",
        cabinetDefinitionId: definition.id,
        moduleId,
        additive: false,
      });
    },
    [definition.id]
  );

  const selectSemanticPreview = useCallback(
    (selection: CabinetSemanticSelection) => {
      setSemanticSelection(selection);
      if (selection.moduleId) setActiveModuleId(selection.moduleId);
    },
    []
  );

  return {
    activeModuleId,
    setActiveModuleId,
    semanticSelection,
    setSemanticSelection,
    selectStudioModule,
    selectSemanticPreview,
  };
}
