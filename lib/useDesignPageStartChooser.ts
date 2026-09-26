"use client";

import { useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import type { StartDesignChooserProps } from "@/components/editor/start/StartDesignChooser";
import { track } from "@/lib/analytics";
import type { HousePlanTemplate, HousePlanTemplateApplyOptions } from "@/lib/design-page-house-plan";
import { BLANK_ROOM_TEMPLATE } from "@/lib/start-design";
import { parseStartDesignParam, START_UPLOAD_CALLBACK_URL, type StartDesignParam } from "@/lib/start-design-link";

export type UseDesignPageStartChooserInput = {
  state: {
    isAuthenticated: boolean;
    /** Nothing to keep: the first visit's room, untouched. */
    designIsEmpty: boolean;
    localBackupHydrated: boolean;
    /** Products have loaded and this isn't Client Preview: Plan's own template buttons wait for it too. */
    canEdit: boolean;
  };
  actions: {
    applyPlanTemplate: (template: HousePlanTemplate, options?: HousePlanTemplateApplyOptions) => void;
    requirePlanChoiceForNextTemplate: () => void;
    /** Plan's template list, which has the address search. */
    openTemplatePicker: () => void;
    /** The same from New design: it closes My designs, and the next template asks before replacing. */
    openNewDesignTemplatePicker: () => void;
    closeMyDesigns: () => void;
    /** Plan in 2D. */
    goPlan: () => void;
    /** Plan in 2D with the room tool on; records nothing itself. */
    drawRoom: () => void;
  };
};

export type StartChooserState = { open: boolean; asNewDesign: boolean; signIn: boolean };
type SetChooser = (next: StartChooserState) => void;
const CLOSED: StartChooserState = { open: false, asNewDesign: false, signIn: false };

/**
 * One `launch_path_selected` per choice: a click in Start a new design, or a `?start=` link.
 * Uploads are recorded by the upload window when it opens, as for every other upload entry.
 */
function trackStartPath(path: "template" | "draw" | "blank", source: "start_chooser" | "start_link") {
  track("launch_path_selected", { path, source });
}

/**
 * Goes to Plan, then asks its upload section to open the upload window once it has rendered
 * (the section listens for `floor-plan-upload-requested`, as for the address search's Upload).
 */
function openUploadWindow(actions: UseDesignPageStartChooserInput["actions"]) {
  actions.goPlan();
  window.requestAnimationFrame(() =>
    window.requestAnimationFrame(() => window.dispatchEvent(new Event("floor-plan-upload-requested")))
  );
}

/** Takes `?start=` off the address, so a reload doesn't start again. Saved designs ignore it. */
function takeStartParam(): StartDesignParam | null {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("start")) return null;
  const start = parseStartDesignParam(url.searchParams.get("start"));
  url.searchParams.delete("start");
  window.history.replaceState(window.history.state, "", url);
  return url.searchParams.has("designId") ? null : start;
}

export function applyStartParam(start: StartDesignParam, input: UseDesignPageStartChooserInput, setChooser: SetChooser) {
  const { state, actions } = input;
  if (start === "upload") {
    if (state.isAuthenticated) openUploadWindow(actions);
    else setChooser({ open: true, asNewDesign: false, signIn: true });
    return;
  }
  // A design with content stays as it is; the address never replaces work.
  if (!state.designIsEmpty) return;
  if (start === "choose" || start === "template") return setChooser({ open: true, asNewDesign: false, signIn: false });
  trackStartPath(start, "start_link");
  if (start === "draw") actions.drawRoom();
  else actions.goPlan();
}

/** `?start=choose|template|draw|upload|blank` opens the editor at that choice, once. */
function useStartParam(input: UseDesignPageStartChooserInput, setChooser: SetChooser) {
  const latest = useRef(input);
  const handled = useRef(false);
  useEffect(() => {
    latest.current = input;
  });
  const ready = input.state.localBackupHydrated && input.state.canEdit;
  useEffect(() => {
    if (handled.current || !ready) return;
    handled.current = true;
    const start = takeStartParam();
    // Next frame: the local design has hydrated, and the chooser's state isn't set inside an effect.
    if (start) window.requestAnimationFrame(() => applyStartParam(start, latest.current, setChooser));
  }, [ready, setChooser]);
}

export function buildStartChooserProps(
  chooser: StartChooserState,
  setChooser: SetChooser,
  input: UseDesignPageStartChooserInput
): StartDesignChooserProps {
  const { state, actions } = input;
  const close = () => setChooser(CLOSED);
  // From New design, replacing always asks first, as New design did before; a first visit's
  // untouched room is simply kept or replaced.
  const keepsCurrentDesign = !chooser.asNewDesign && state.designIsEmpty;
  const startFrom = (template: HousePlanTemplate, options?: HousePlanTemplateApplyOptions) => {
    close();
    if (chooser.asNewDesign) actions.requirePlanChoiceForNextTemplate();
    actions.applyPlanTemplate(template, options);
  };
  const choose = (path: "template" | "draw" | "blank", run: () => void) => () => {
    trackStartPath(path, "start_chooser");
    run();
  };
  return {
    open: chooser.open,
    ready: state.canEdit,
    isAuthenticated: state.isAuthenticated,
    onClose: close,
    onChooseTemplate: (card, furnished) =>
      choose("template", () =>
        startFrom(card.template, furnished && card.furnishingPackId ? { furnishingPackId: card.furnishingPackId } : undefined)
      )(),
    onChooseDraw: choose("draw", () => {
      if (!keepsCurrentDesign) return startFrom(BLANK_ROOM_TEMPLATE, { onApplied: actions.drawRoom });
      close();
      actions.drawRoom();
    }),
    onChooseBlank: choose("blank", () => {
      if (!keepsCurrentDesign) return startFrom(BLANK_ROOM_TEMPLATE);
      close();
      actions.goPlan();
    }),
    onChooseUpload: () => {
      if (!state.isAuthenticated) return setChooser({ ...chooser, signIn: true });
      close();
      openUploadWindow(actions);
    },
    onSearchAddress: () => {
      close();
      if (chooser.asNewDesign) actions.openNewDesignTemplatePicker();
      else actions.openTemplatePicker();
    },
    uploadSignIn: {
      open: chooser.open && chooser.signIn,
      onClose: () => setChooser({ ...chooser, signIn: false }),
      onSignIn: () => void signIn("google", { callbackUrl: START_UPLOAD_CALLBACK_URL }),
    },
  };
}

/**
 * Start a new design (audit findings FR1, FR3, ST2): New design opens it, and `?start=` opens
 * the editor at one of its choices. Guests sign in before uploading (ST3).
 */
export function useDesignPageStartChooser(input: UseDesignPageStartChooserInput) {
  const [chooser, setChooser] = useState<StartChooserState>(CLOSED);
  useStartParam(input, setChooser);
  const openAsNewDesign = () => {
    input.actions.closeMyDesigns();
    setChooser({ open: true, asNewDesign: true, signIn: false });
  };
  return { chooserProps: buildStartChooserProps(chooser, setChooser, input), openAsNewDesign };
}
