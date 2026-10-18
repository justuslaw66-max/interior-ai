import type { AISuggestionEditor } from "@/lib/ai/applySuggestion";
import { buildDesignNotesRoom, floorSwapProblem } from "@/lib/ai/design-notes-room";
import { CATALOG_ITEMS } from "@/lib/catalog";
import type { RoomWithSurfaces } from "@/lib/floor-plan-surface-checks";
import type { DesignItem } from "@/lib/room-types";
import { UserFacingError } from "@/lib/user-facing-error";

export type AiNotesEditorActions = {
  getItems: () => DesignItem[];
  resizeRugToSofa: (sofa: DesignItem, rug?: DesignItem) => { items?: Array<{ productId: string }> } | void;
  makeRoomCheaper: () => void;
  addItem: (productId: string, position: [number, number, number]) => void;
  commitItems: (items: DesignItem[], actionName: string) => void;
  showToast: (message: string) => void;
  /** The surface workspace's own action: one undo step, its toast and its analytics event. */
  applyFloorMaterialToRoom: (materialId: string, roomId?: string | null) => void;
};

/**
 * What an AI notes suggestion may do to the design (moved out of `useDesignPageAiNotes` on 18 Oct 2026). A floor swap
 * is checked again against the active room as it is now (`floorSwapProblem`) before the floor action lays it.
 */
export function createAiSuggestionEditor(
  actions: AiNotesEditorActions,
  room: RoomWithSurfaces | null
): AISuggestionEditor {
  const { getItems, resizeRugToSofa, makeRoomCheaper, addItem, commitItems, showToast, applyFloorMaterialToRoom } = actions;
  return {
    getItemById: (id) => getItems().find((item) => item.instanceId === id) ?? null,
    findFirstByCategory: (category) =>
      getItems().find((item) => CATALOG_ITEMS[item.productId]?.category === category) ?? null,
    resizeRugToSofaRule: resizeRugToSofa,
    makeRoomCheaper,
    addLampNearReadingCorner: async () => {
      const lamp = Object.values(CATALOG_ITEMS).find((item) => item.category === "floor_lamp");
      if (!lamp) {
        showToast("No floor lamp is available in the catalogue yet");
        return;
      }
      addItem(lamp.id, getItems().length > 0 ? [2, 0, 2] : [1.5, 0, 1.5]);
    },
    swapFloorMaterial: (action) => {
      const problem = floorSwapProblem(buildDesignNotesRoom(room), action);
      if (problem) throw new UserFacingError(problem);
      applyFloorMaterialToRoom(action.materialId, action.roomId);
    },
    commitDesignSnapshot: (snapshot) => {
      if (!snapshot.items) return;
      commitItems(snapshot.items as DesignItem[], "Apply AI suggestion");
    },
    getDesignSnapshot: () => ({ items: getItems() }),
  };
}
