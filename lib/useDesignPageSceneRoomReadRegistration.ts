"use client";

import type { DesignPageDocumentRoomRegistration } from "@/lib/useDesignPageDocumentRoomRegistration";
import {
  useDesignPageSceneRoomReadFacade,
  type UseDesignPageSceneRoomReadFacadeInput,
} from "@/lib/useDesignPageSceneRoomReadFacade";

type SceneInput = UseDesignPageSceneRoomReadFacadeInput["scene"];
type RoomInput = UseDesignPageSceneRoomReadFacadeInput["room"];

export type UseDesignPageSceneRoomReadRegistrationInput = {
  boundaries: {
    documentRoom: DesignPageDocumentRoomRegistration;
  };
  state: {
    plan: Pick<SceneInput["state"]["plan"], "selectedPlanRoomId">;
    editor: SceneInput["state"]["editor"];
    ai: SceneInput["state"]["ai"];
    surface: RoomInput["state"]["surface"];
  };
  configuration: RoomInput["configuration"];
  actions: {
    scene: SceneInput["actions"];
    room: RoomInput["actions"];
  };
};

/**
 * Adapts the grouped document and room registration into the existing scene
 * and room read facade without changing its scene-before-room hook order.
 */
export function useDesignPageSceneRoomReadRegistration({
  boundaries: { documentRoom },
  state,
  configuration,
  actions,
}: UseDesignPageSceneRoomReadRegistrationInput) {
  const {
    boundaries: {
      document: { plan, snapshot },
    },
    state: { floor },
    derived: { room, plan: planDerived },
  } = documentRoom;

  const sceneRoom = useDesignPageSceneRoomReadFacade({
    scene: {
      state: {
        document: {
          designSnapshot: snapshot.state.designSnapshot,
          activeRoom: room.activeRoom,
          items: room.items,
        },
        plan: {
          housePlanRooms: planDerived.housePlan2D.rooms,
          activeRoomPlanOffset: planDerived.activeRoomPlanOffset,
          roomWidth: room.roomWidth,
          roomDepth: room.roomDepth,
          stackedFloorView: floor.stackedFloorView,
          hiddenFloorLevels: floor.hiddenFloorLevels,
          selectedPlanRoomId: state.plan.selectedPlanRoomId,
        },
        editor: state.editor,
        ai: state.ai,
      },
      actions: actions.scene,
    },
    room: {
      state: {
        document: {
          designSnapshot: snapshot.state.designSnapshot,
          activeRoom: room.activeRoom,
          items: room.items,
        },
        plan: {
          planOpenings: plan.state.planOpenings,
          selectedPlanRoomId: state.plan.selectedPlanRoomId,
          activeRoomPlanOffset: planDerived.activeRoomPlanOffset,
          roomHeight: room.roomHeight,
          wallThickness: room.wallThickness,
        },
        surface: state.surface,
      },
      configuration,
      actions: actions.room,
    },
  });

  return {
    boundaries: {
      sceneRoom,
      scene: sceneRoom.scene,
      room: sceneRoom.room,
    },
    state: {
      scene: sceneRoom.scene.state,
      room: sceneRoom.room.state,
    },
    derived: {
      scene: sceneRoom.scene.derived,
      room: sceneRoom.room.derived,
    },
    configuration,
    refs: {},
    actions: {
      scene: sceneRoom.scene.actions,
      room: sceneRoom.room.actions,
    },
    queries: { scene: sceneRoom.scene.queries },
  };
}

export type DesignPageSceneRoomReadRegistration = ReturnType<
  typeof useDesignPageSceneRoomReadRegistration
>;
