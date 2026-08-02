import type {
  DesignPagePanelRegionProps,
  DesignPagePanelRegionState,
} from "@/components/editor/design-page/DesignPagePanelRegion";

type ShoppingPanel = NonNullable<DesignPagePanelRegionState["shopping"]>;
type CabinetPanel = NonNullable<DesignPagePanelRegionState["selectedCabinet"]>;
type ItemPanel = NonNullable<DesignPagePanelRegionState["selectedItem"]>;
type ControlsPanel = NonNullable<DesignPagePanelRegionState["controls"]>;

export type BuildDesignPagePanelRegionAdapterInput = {
  state: {
    editorMode: "design" | "adjust" | "ai" | "buy" | "present";
    shoppingVisible: boolean;
    controlsVisible: boolean;
    hasSelectedCabinet: boolean;
    hasSelectedProduct: boolean;
  };
  configuration: DesignPagePanelRegionProps["configuration"];
  panels: {
    shopping: ShoppingPanel;
    selectedCabinet: CabinetPanel;
    selectedItem: ItemPanel;
    controls: ControlsPanel;
  };
  actions: DesignPagePanelRegionProps["actions"];
};

/** Pure boundary between editor orchestration and fixed panel composition. */
export function buildDesignPagePanelRegionAdapter({
  state,
  configuration,
  panels,
  actions,
}: BuildDesignPagePanelRegionAdapterInput): DesignPagePanelRegionProps {
  return {
    state: {
      shopping: state.shoppingVisible ? panels.shopping : null,
      selectedCabinet:
        state.editorMode === "adjust" && state.hasSelectedCabinet
          ? panels.selectedCabinet
          : null,
      selectedItem:
        state.editorMode === "adjust" && state.hasSelectedProduct
          ? panels.selectedItem
          : null,
      controls: state.controlsVisible ? panels.controls : null,
    },
    configuration,
    actions,
  };
}
