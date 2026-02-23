export type AISuggestionAction =
  | { type: "RUG_RESIZE_TO_SOFA"; sofaItemId?: string }
  | { type: "MAKE_CHEAPER"; percent?: number }
  | { type: "ADD_LAMP_NEAR_READING" };

type DesignSnapshot = {
  items?: Array<{ productId: string }>;
};

type EditorContext = {
  getItemById: (id: string) => any | null;
  findFirstByCategory: (cat: string) => any | null;
  resizeRugToSofaRule: (sofa: any, rug?: any) => DesignSnapshot | void;
  makeRoomCheaper: (percent?: number) => Promise<void> | void;
  addLampNearReadingCorner: () => Promise<void> | void;
  commitDesignSnapshot: (next: DesignSnapshot) => void;
  getDesignSnapshot: () => DesignSnapshot;
};

export async function applyAISuggestionAction(opts: {
  action: AISuggestionAction;
  editor: EditorContext;
}) {
  const { action, editor } = opts;

  switch (action.type) {
    case "RUG_RESIZE_TO_SOFA": {
      const sofa =
        (action.sofaItemId && editor.getItemById(action.sofaItemId)) ||
        editor.findFirstByCategory("sofa");

      if (!sofa) throw new Error("No sofa found to size rug against.");

      const nextSnapshot = editor.resizeRugToSofaRule(sofa);
      editor.commitDesignSnapshot(nextSnapshot ?? editor.getDesignSnapshot());
      return;
    }

    case "MAKE_CHEAPER": {
      await editor.makeRoomCheaper(action.percent ?? 10);
      return;
    }

    case "ADD_LAMP_NEAR_READING": {
      await editor.addLampNearReadingCorner();
      return;
    }

    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}
