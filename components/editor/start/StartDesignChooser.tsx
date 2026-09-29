"use client";

import { useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { X } from "lucide-react";
import { useEditorDialogLifecycle } from "@/components/editor/design-system/useEditorDialogLifecycle";
import { StartChoiceCards } from "@/components/editor/start/StartChoiceCards";
import { StartTemplateGallery } from "@/components/editor/start/StartTemplateGallery";
import { UploadSignInDialog, type UploadSignInDialogProps } from "@/components/editor/start/UploadSignInDialog";
import type { StartTemplateCard } from "@/lib/start-design";
import { CLIENT_PREVIEW_FALLBACK_ACTION_ID } from "@/lib/useClientPreviewCommandBarFocus";

// New design opens from More, so focus goes back there.
const START_DESIGN_RETURN_FOCUS_IDS = [CLIENT_PREVIEW_FALLBACK_ACTION_ID] as const;

export type StartDesignChooserProps = {
  open: boolean;
  /** The choices wait until the editor can change the design (products loaded, not Client Preview). */
  ready: boolean;
  isAuthenticated: boolean;
  onClose: () => void;
  onChooseTemplate: (card: StartTemplateCard, furnished: boolean) => void;
  onChooseDraw: () => void;
  onChooseUpload: () => void;
  onChooseBlank: () => void;
  onSearchAddress: () => void;
  /** Guests sign in before uploading: over the choices, or on its own for Upload elsewhere. */
  uploadSignIn: UploadSignInDialogProps;
};

/**
 * Plan's template list focuses its heading and later hands focus back to what held it, so More
 * takes focus first, once the chooser and the background it made inert are gone.
 */
function handOverToAddressSearch(close: () => void, openAddressSearch: () => void) {
  flushSync(close);
  document.getElementById(CLIENT_PREVIEW_FALLBACK_ACTION_ID)?.focus({ preventScroll: true });
  openAddressSearch();
}

/**
 * Start a new design (audit findings FR1, FR3, ST2, ST7, ST8), laid out as in the mockup: four
 * ways to begin, then the templates. It covers the editor as one screen; Close or Escape keeps
 * the design that was open.
 */
export function StartDesignChooser(props: StartDesignChooserProps) {
  const { open, isAuthenticated, onClose } = props;
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const templatesHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const focusRestorationEnabledRef = useRef(true);
  useEffect(() => {
    if (open) focusRestorationEnabledRef.current = true;
  }, [open]);
  const requestClose = useEditorDialogLifecycle({
    open, dialogRef, panelRef, closeButtonRef, returnFocusIds: START_DESIGN_RETURN_FOCUS_IDS,
    focusRestorationEnabledRef, hideWhenSuperseded: false, cancelFocusRestorationOnUnmount: false,
    manageBackground: true, lockBodyScroll: true, waitForEntryTransition: false, closeDisabled: false, onClose,
  });
  if (!open) return <UploadSignInDialog {...props.uploadSignIn} />;
  const showTemplates = () => {
    templatesHeadingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    templatesHeadingRef.current?.focus({ preventScroll: true });
  };
  const searchAddress = () => {
    focusRestorationEnabledRef.current = false;
    handOverToAddressSearch(onClose, props.onSearchAddress);
  };
  return (
    <div
      ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="start-design-title"
      data-testid="start-design-chooser" data-editor-dialog-state="mounting"
      className="fixed inset-0 z-[60] overflow-y-auto bg-[#fafaf9] text-neutral-950 outline-none"
    >
      <div ref={panelRef} tabIndex={-1} data-editor-dialog-state="mounting"
        className="mx-auto w-full max-w-[1120px] px-4 pb-12 pt-6 outline-none sm:px-8 md:pt-10">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 id="start-design-title" tabIndex={-1} data-editor-dialog-initial-focus="true"
              className="text-[26px] font-bold leading-8 tracking-tight outline-none md:text-[30px] md:leading-9">
              Start a new design
            </h1>
            <p className="mt-2 text-base leading-[22px] text-neutral-600">
              Choose how to begin. You can change the rooms and products at any time.
            </p>
          </div>
          <button ref={closeButtonRef} type="button" aria-label="Close" data-testid="start-design-close"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-neutral-700 outline-none hover:bg-neutral-200/60 focus-visible:ring-2 focus-visible:ring-blue-600"
            onClick={requestClose}>
            <X aria-hidden="true" className="h-5 w-5" strokeWidth={1.8} />
          </button>
        </div>
        <StartChoiceCards isAuthenticated={isAuthenticated} ready={props.ready} onTemplates={showTemplates}
          onDraw={props.onChooseDraw} onUpload={props.onChooseUpload} onBlank={props.onChooseBlank} />
        <StartTemplateGallery headingRef={templatesHeadingRef} ready={props.ready}
          onChooseTemplate={props.onChooseTemplate} onSearchAddress={searchAddress} />
      </div>
      <UploadSignInDialog {...props.uploadSignIn} />
    </div>
  );
}
