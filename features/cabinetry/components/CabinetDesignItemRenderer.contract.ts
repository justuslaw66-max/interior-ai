import type { SceneRoomItemEntry } from "@/lib/design-page-scene-domain";

import type { ParametricCabinetDesignItem } from "../designItemAdapters";

export type CabinetDesignItemRendererProps = {
  sceneEntry: SceneRoomItemEntry;
  item: ParametricCabinetDesignItem;
  selected: boolean;
  interactive: boolean;
  showPlanLabel?: boolean;
  renderReadyKey: string;
  onRenderReadyChange: (key: string, ready: boolean) => void;
  onSelect: (id: string, additive: boolean) => void;
};
