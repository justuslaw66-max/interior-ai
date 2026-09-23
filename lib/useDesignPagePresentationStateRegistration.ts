"use client";

import type { CameraView } from "@/lib/design-page-types";
import {
  useDesignPageLayoutVersionsController,
  type DesignPageLayoutVersionsActions,
  type DesignPageLayoutVersionsRefs,
} from "@/lib/useDesignPageLayoutVersionsController";
import {
  useDesignPageNamedCameraViewsController,
  type DesignPageNamedCameraViewsControllerActions,
} from "@/lib/useDesignPageNamedCameraViewsController";

const MAXIMUM_SAVED_CAMERA_VIEWS = 6;
const NAMED_CAMERA_VIEW_OPEN_TRANSITION_MS = 460;

export type UseDesignPagePresentationStateRegistrationInput = {
  state: {
    cameraView: CameraView;
  };
  refs: DesignPageLayoutVersionsRefs;
  actions: {
    document: Pick<
      DesignPageNamedCameraViewsControllerActions,
      "setDesignSnapshot"
    >;
    camera: Pick<
      DesignPageNamedCameraViewsControllerActions,
      | "setLegacySavedViews"
      | "handleEditorViewModeChange"
      | "transitionToCameraView"
    >;
    history: Pick<DesignPageLayoutVersionsActions, "history">;
    selection: Pick<DesignPageLayoutVersionsActions, "updateSelection">;
    feedback: Pick<
      DesignPageNamedCameraViewsControllerActions,
      "showToast"
    >;
  };
};

/**
 * Registers room-scoped presentation state in its established hook slot.
 * Camera-view and layout-version behavior remains in their focused controllers;
 * this adapter only shares the document, history, selection, and toast edges.
 */
export function useDesignPagePresentationStateRegistration({
  state: { cameraView },
  refs,
  actions,
}: UseDesignPagePresentationStateRegistrationInput) {
  const namedCameraViews = useDesignPageNamedCameraViewsController({
    state: { cameraView },
    configuration: {
      maximumSavedViews: MAXIMUM_SAVED_CAMERA_VIEWS,
      openTransitionDurationMs: NAMED_CAMERA_VIEW_OPEN_TRANSITION_MS,
    },
    refs,
    actions: {
      setDesignSnapshot: actions.document.setDesignSnapshot,
      setLegacySavedViews: actions.camera.setLegacySavedViews,
      showToast: actions.feedback.showToast,
      handleEditorViewModeChange: actions.camera.handleEditorViewModeChange,
      transitionToCameraView: actions.camera.transitionToCameraView,
    },
  });

  const layoutVersions = useDesignPageLayoutVersionsController({
    refs,
    actions: {
      setDesignSnapshot: actions.document.setDesignSnapshot,
      history: actions.history.history,
      updateSelection: actions.selection.updateSelection,
      showToast: actions.feedback.showToast,
    },
  });

  return {
    boundaries: {
      namedCameraViews,
      layoutVersions,
    },
    state: {
      cameraViewNameInput: namedCameraViews.state.cameraViewNameInput,
      layoutVersionNameInput: layoutVersions.state.layoutVersionNameInput,
    },
    actions: {
      ...namedCameraViews.actions,
      ...layoutVersions.actions,
    },
  };
}
