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
    /** The same from New design: the next template asks before replacing. */
    openNewDesignTemplatePicker: () => void;
    /** Plan in 2D. */
    goPlan: () => void;
    /** Plan in 2D with the room tool on; records nothing itself. */
    drawRoom: () => void;
    openPricing: () => void;
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

type EntryLink = { start: StartDesignParam | null; pricing: boolean };

/**
 * Takes `?start=` and `?pricing=` off the address, so a reload doesn't act on them again. Saved
 * designs ignore `?start=`.
 */
function takeEntryLink(): EntryLink | null {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("start") && !url.searchParams.has("pricing")) return null;
  const start = parseStartDesignParam(url.searchParams.get("start"));
  const pricing = url.searchParams.get("pricing") === "open";
  url.searchParams.delete("start");
  url.searchParams.delete("pricing");
  window.history.replaceState(window.history.state, "", url);
  return { start: url.searchParams.has("designId") ? null : start, pricing };
}

export function applyStartParam(start: StartDesignParam, input: UseDesignPageStartChooserInput, setChooser: SetChooser) {
  const { state, actions } = input;
  if (start === "upload") {
    if (state.isAuthenticated) openUploadWindow(actions);
    else setChooser({ open: true, asNewDesign: false, signIn: true });
    return;
  }
  // New design (from My designs) asks before replacing, as it does in the editor.
  if (start === "new") return setChooser({ open: true, asNewDesign: true, signIn: false });
  // A design with content stays as it is; the address never replaces work.
  if (!state.designIsEmpty) return;
  if (start === "choose" || start === "template") return setChooser({ open: true, asNewDesign: false, signIn: false });
  trackStartPath(start, "start_link");
  if (start === "draw") actions.drawRoom();
  else actions.goPlan();
}

export function applyEntryLink(link: EntryLink, input: UseDesignPageStartChooserInput, setChooser: SetChooser) {
  if (link.start) applyStartParam(link.start, input, setChooser);
  if (link.pricing) input.actions.openPricing();
}

/** `?start=choose|new|template|draw|upload|blank` opens the editor at that choice, once; `?pricing=open` opens Pricing. */
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
    const link = takeEntryLink();
    // Next frame: the local design has hydrated, and the chooser's state isn't set inside an effect.
    if (link) window.requestAnimationFrame(() => applyEntryLink(link, latest.current, setChooser));
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
  const openAsNewDesign = () => setChooser({ open: true, asNewDesign: true, signIn: false });
  return { chooserProps: buildStartChooserProps(chooser, setChooser, input), openAsNewDesign };
}
