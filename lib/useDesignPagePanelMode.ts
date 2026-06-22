import { useCallback, type Dispatch, type SetStateAction } from "react";

export type DesignPageEditorMode = "design" | "adjust" | "ai" | "buy" | "present";
export type DesignControlsPanelMode = "plan" | "furnish" | "ai";

type UseDesignPagePanelModeParams = {
  editorMode: DesignPageEditorMode;
  setEditorMode: Dispatch<SetStateAction<DesignPageEditorMode>>;
  designPanelOpen: boolean;
  setDesignPanelOpen: Dispatch<SetStateAction<boolean>>;
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
  setItemCartOpen,
}: UseDesignPagePanelModeParams) {
  const designControlsPanelMode = resolveDesignControlsPanelMode(editorMode);
  const designControlsPanelVisible = isDesignControlsPanelMode(editorMode) && designPanelOpen;

  const goPlan = useCallback(() => {
    setEditorMode("design");
    setDesignPanelOpen(true);
    setItemCartOpen(false);
  }, [setDesignPanelOpen, setEditorMode, setItemCartOpen]);

  const goFurnish = useCallback(() => {
    setEditorMode("adjust");
    setDesignPanelOpen(true);
    setItemCartOpen(false);
  }, [setDesignPanelOpen, setEditorMode, setItemCartOpen]);

  const goAiDesign = useCallback(() => {
    setEditorMode("ai");
    setDesignPanelOpen(true);
    setItemCartOpen(false);
  }, [setDesignPanelOpen, setEditorMode, setItemCartOpen]);

  const goShop = useCallback(() => {
    setEditorMode("buy");
    setDesignPanelOpen(false);
    setItemCartOpen(false);
  }, [setDesignPanelOpen, setEditorMode, setItemCartOpen]);

  return {
    designControlsPanelMode,
    designControlsPanelVisible,
    goPlan,
    goFurnish,
    goAiDesign,
    goShop,
  };
}
