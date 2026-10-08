/**
 * One template list (UX audit ST8, J's Q4): Plan's "Choose a template" opens Start a new design at
 * its Templates, which Start a new design's hook answers (useDesignPageStartChooser). An event, as
 * for Upload floor plan (lib/floor-plan-upload-request.ts), keeps Plan's entries free of props.
 */
export const START_TEMPLATES_REQUESTED_EVENT = "start-templates-requested";

/** Plan's "Choose a template" buttons (and Surfaces' Templates), which get focus back when it closes. */
export const PLAN_START_TEMPLATE_ACTION_ID = "plan-start-template-action";
export const PLAN_TEMPLATE_LIBRARY_ACTION_ID = "plan-tool-template-library-action";
export const SURFACES_START_TEMPLATE_ACTION_ID = "surfaces-start-template-action";

export type StartTemplatesRequest = {
  /** The control to hand focus back to when the chooser closes. */
  openerId: string | null;
};

/** Opens Start a new design at its Templates, over the design that's open. */
export function requestStartTemplates(request: StartTemplatesRequest) {
  window.dispatchEvent(new CustomEvent(START_TEMPLATES_REQUESTED_EVENT, { detail: request }));
}

export function startTemplatesRequestOf(event: Event): StartTemplatesRequest {
  const detail = (event as CustomEvent<Partial<StartTemplatesRequest> | null>).detail;
  return { openerId: detail?.openerId ?? null };
}
