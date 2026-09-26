import { useCallback, useEffect, type Dispatch, type SetStateAction } from "react";

export type DesignPageEditorMode = "design" | "adjust" | "ai" | "buy" | "present";
export type DesignControlsPanelMode = "plan" | "furnish" | "ai";

type UseDesignPagePanelModeParams = {
  editorMode: DesignPageEditorMode;
  setEditorMode: Dispatch<SetStateAction<DesignPageEditorMode>>;
  designPanelOpen: boolean;
  setDesignPanelOpen: Dispatch<SetStateAction<boolean>>;
  setDesignPanelCollapsed: Dispatch<SetStateAction<boolean>>;
  setItemCartOpen: Dispatch<SetStateAction<boolean>>;
};

export function resolveDesignControlsPanelMode(
  editorMode: DesignPageEditorMode
): DesignControlsPanelMode {
  if (editorMode === "ai") return "ai";
  if (editorMode === "adjust") return "furnish";
  return "plan";
}

export function isDesignControlsPanelMode(editorMode: DesignPageEditorMode): boolean {
  return editorMode === "design" || editorMode === "adjust" || editorMode === "ai";
}

export function useDesignPagePanelMode({
  editorMode,
  setEditorMode,
  designPanelOpen,
  setDesignPanelOpen,
  setDesignPanelCollapsed,
  setItemCartOpen,
}: UseDesignPagePanelModeParams) {
  const designControlsPanelMode = resolveDesignControlsPanelMode(editorMode);
  const designControlsPanelVisible = isDesignControlsPanelMode(editorMode) && designPanelOpen;

  // Choosing a step always shows that step's panel, even when the sidebar was collapsed to its
  // edge strip: otherwise the step changes and nothing appears (audit finding ST13).
  const openStepPanel = useCallback(
    (mode: "design" | "adjust" | "ai") => {
      setEditorMode(mode);
      setDesignPanelOpen(true);
      setDesignPanelCollapsed(false);
      setItemCartOpen(false);
    },
    [setDesignPanelCollapsed, setDesignPanelOpen, setEditorMode, setItemCartOpen]
  );
  const goPlan = useCallback(() => openStepPanel("design"), [openStepPanel]);
  const goFurnish = useCallback(() => openStepPanel("adjust"), [openStepPanel]);
  const goAiDesign = useCallback(() => openStepPanel("ai"), [openStepPanel]);

  const goShop = useCallback(() => {
    setEditorMode("buy");
    setDesignPanelOpen(false);
    setItemCartOpen(false);
  }, [setDesignPanelOpen, setEditorMode, setItemCartOpen]);

  // A closed panel never reopens collapsed.
  useEffect(() => {
    if (!designPanelOpen) setDesignPanelCollapsed(false);
  }, [designPanelOpen, setDesignPanelCollapsed]);

  return {
    designControlsPanelMode,
    designControlsPanelVisible,
    goPlan,
    goFurnish,
    goAiDesign,
    goShop,
  };
}
