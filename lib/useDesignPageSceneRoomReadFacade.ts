"use client";

import {
  useDesignPageRoomReadModel,
  type UseDesignPageRoomReadModelInput,
} from "@/lib/useDesignPageRoomReadModel";
import {
  useDesignPageSceneReadModel,
  type UseDesignPageSceneReadModelInput,
} from "@/lib/useDesignPageSceneReadModel";

export type UseDesignPageSceneRoomReadFacadeInput = {
  scene: UseDesignPageSceneReadModelInput;
  room: Omit<UseDesignPageRoomReadModelInput, "derived">;
};

export type DesignPageSceneRoomReadFacade = {
  scene: ReturnType<typeof useDesignPageSceneReadModel>;
  room: ReturnType<typeof useDesignPageRoomReadModel>;
};

/**
 * Registers the scene and room read models in their established order.
 * The scene-owned room index is an internal dependency of the room model,
 * while each model's public state, derived values, actions, and queries stay
 * grouped under its original contract.
 */
export function useDesignPageSceneRoomReadFacade({
  scene: sceneInput,
  room: roomInput,
}: UseDesignPageSceneRoomReadFacadeInput): DesignPageSceneRoomReadFacade {
  const scene = useDesignPageSceneReadModel(sceneInput);
  const room = useDesignPageRoomReadModel({
    ...roomInput,
    derived: { roomSnapshotById: scene.derived.roomSnapshotById },
  });

  return { scene, room };
}
