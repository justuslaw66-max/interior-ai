"use client";

import {
  useDesignPageNewPlanController,
  type DesignPageNewPlanControllerActions,
  type DesignPageNewPlanControllerState,
} from "@/lib/useDesignPageNewPlanController";
import {
  useDesignPagePersistence,
  type UseDesignPagePersistenceParams,
} from "@/lib/useDesignPagePersistence";

type NewPlanFacadeActions = Omit<
  DesignPageNewPlanControllerActions,
  | "closeMyDesigns"
  | "preserveCurrentDesign"
  | "detachCurrentDesignForNewDraft"
>;

export type UseDesignPagePersistenceNewPlanFacadeInput = {
  state: UseDesignPagePersistenceParams["state"] & {
    newPlan: Pick<DesignPageNewPlanControllerState, "pendingReplacement">;
  };
  actions: {
    persistence: UseDesignPagePersistenceParams["actions"];
    newPlan: NewPlanFacadeActions;
  };
  configuration: UseDesignPagePersistenceParams["configuration"];
  refs: UseDesignPagePersistenceParams["refs"];
};

export function useDesignPagePersistenceNewPlanFacade({
  state: { identity, document, session, lifecycle, newPlan: newPlanState },
  actions,
  configuration,
  refs,
}: UseDesignPagePersistenceNewPlanFacadeInput) {
  const persistence = useDesignPagePersistence({
    state: { identity, document, session, lifecycle },
    actions: actions.persistence,
    configuration,
    refs,
  });

  const newPlan = useDesignPageNewPlanController({
    state: {
      isAuthenticated: session.isAuthenticated,
      pendingReplacement: newPlanState.pendingReplacement,
    },
    actions: {
      ...actions.newPlan,
      closeMyDesigns: persistence.actions.closeMyDesigns,
      preserveCurrentDesign: persistence.actions.preserveCurrentDesign,
      detachCurrentDesignForNewDraft:
        persistence.actions.detachCurrentDesignForNewDraft,
    },
  });

  return {
    state: {
      persistence: persistence.state,
      newPlan: newPlan.state,
    },
    actions: {
      persistence: persistence.actions,
      newPlan: newPlan.actions,
    },
  };
}
