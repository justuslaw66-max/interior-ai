import { DesignApiError } from "@/lib/design-api-client";

export type DesignPageLoadRequest = {
  epoch: number;
  controller: AbortController;
};

/** Owns design-load supersession independently of transport abort compliance. */
export function createDesignPageLoadRequestCoordinator() {
  let epoch = 0;
  let currentController: AbortController | null = null;

  return {
    start(): DesignPageLoadRequest {
      epoch += 1;
      currentController?.abort();
      const controller = new AbortController();
      currentController = controller;
      return { epoch, controller };
    },
    cancel() {
      if (!currentController) return;
      epoch += 1;
      const controller = currentController;
      currentController = null;
      controller.abort();
    },
    isCurrent(request: DesignPageLoadRequest) {
      return request.epoch === epoch;
    },
    finish(request: DesignPageLoadRequest) {
      if (currentController === request.controller) currentController = null;
    },
  };
}

export function isSupersededDesignPageLoadError(
  current: boolean,
  error: unknown
): boolean {
  return !current ||
    (error instanceof DesignApiError && error.kind === "aborted");
}
