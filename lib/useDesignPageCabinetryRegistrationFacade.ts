"use client";

import type { MutableRefObject } from "react";

import {
  useDesignPageCabinetry,
  type UseDesignPageCabinetryInput,
} from "@/features/cabinetry/useDesignPageCabinetry";
import type { DesignItem, DesignSnapshot } from "@/lib/room-types";
import type { SurfaceTargetMode } from "@/lib/useDesignPageSurfaceActions";

type CabinetryController = ReturnType<typeof useDesignPageCabinetry>;

type DesignPageCabinetryRegistrationState = Omit<
  UseDesignPageCabinetryInput["state"],
  "activePlanRoom" | "preferredWallFaceId"
> & {
  planRoomById: ReadonlyMap<string, { w: number; d: number }>;
  activeSurfaceTarget: SurfaceTargetMode;
  selectedWallFaceId: string | null;
};

export type UseDesignPageCabinetryRegistrationFacadeInput = {
  state: DesignPageCabinetryRegistrationState;
  configuration: UseDesignPageCabinetryInput["configuration"];
  refs: {
    designSnapshot: MutableRefObject<DesignSnapshot>;
    activeItems: MutableRefObject<DesignItem[]>;
  };
  actions: UseDesignPageCabinetryInput["actions"];
};

export type DesignPageCabinetryRegistration = {
  boundaries: { cabinetry: CabinetryController };
  state: CabinetryController["state"] & {
    selectedItem: NonNullable<
      CabinetryController["state"]["selected"]
    >["item"] | null;
  };
  refs: CabinetryController["refs"];
  actions: CabinetryController["actions"];
};

function replaceActiveItemsSnapshot(
  targetRef: MutableRefObject<DesignItem[]>,
  nextItems: DesignItem[]
): void {
  targetRef.current = nextItems;
}

/** Adapts workspace read models and refs to the cabinetry feature boundary. */
export function useDesignPageCabinetryRegistrationFacade({
  state,
  configuration,
  refs,
  actions,
}: UseDesignPageCabinetryRegistrationFacadeInput): DesignPageCabinetryRegistration {
  const {
    planRoomById,
    activeSurfaceTarget,
    selectedWallFaceId,
    ...cabinetryState
  } = state;
  const activePlanRoom = cabinetryState.activeRoom
    ? planRoomById.get(cabinetryState.activeRoom.id) ?? null
    : null;
  const preferredWallFaceId =
    activeSurfaceTarget === "selected_wall" ? selectedWallFaceId : null;

  const cabinetry = useDesignPageCabinetry({
    state: {
      ...cabinetryState,
      activePlanRoom,
      preferredWallFaceId,
    },
    configuration,
    refs: {
      getDesignSnapshot: () => refs.designSnapshot.current,
      replaceActiveItemsSnapshot: (nextItems) => {
        replaceActiveItemsSnapshot(refs.activeItems, nextItems);
      },
    },
    actions,
  });

  return {
    boundaries: { cabinetry },
    state: {
      ...cabinetry.state,
      selectedItem: cabinetry.state.selected?.item ?? null,
    },
    refs: cabinetry.refs,
    actions: cabinetry.actions,
  };
}
