"use client";

import type { ReactNode, RefObject } from "react";
import { CommandBarMenuTrigger } from "./CommandBarMenuTrigger";

type CommandBarMoreMenuProps = {
  dark: boolean;
  /** Phones: the Menu at the start of the bar, ending with the account's items (UX 4d). */
  phone: boolean;
  accountSlot?: ReactNode;
  containerRef: RefObject<HTMLDivElement | null>;
  buttonRef: RefObject<HTMLButtonElement | null>;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  menuButtonClass: string;
  menuPanelClass: string;
  lightingSettingsOpen: boolean;
  showLoadDesign: boolean;
  isDesigner: boolean;
  isClientPreview: boolean;
  presentModeActive: boolean;
  lightingAvailable: boolean;
  overflowSlot?: ReactNode;
  /** Goes to the My designs page, saving the design's latest edits first. */
  onOpenMyDesigns: () => void;
  onNewPlan: () => void;
  onToggleDesignerMode: () => void;
  onToggleClientPreview: () => void;
  onOpenPresentExport: () => void;
  onExport: () => void;
  onOpenLightingSettings: () => void;
  onCloseLightingSettings: () => void;
  onFeedback: () => void;
  /** Phones have no room for Download in the bar, so More offers it there. */
  onDownload?: () => void;
  /** Below `xl` the bar has no room for the design's name, so More offers Rename design. */
  onRenameDesign?: () => void;
};

/** The command bar's More button and menu; on phones, the Menu (UX 4d). */
export function CommandBarMoreMenu(props: CommandBarMoreMenuProps) {
  const { dark, phone, containerRef, buttonRef, open, onToggle, lightingSettingsOpen } = props;
  return (
    <div ref={containerRef} className="relative shrink-0">
      <CommandBarMenuTrigger dark={dark} phone={phone} buttonRef={buttonRef} open={open}
        lightingSettingsOpen={lightingSettingsOpen} onToggle={onToggle} />
      {open && (
        <div
          data-testid="editor-command-overflow-menu" data-touch-area
          role="menu"
          className={props.menuPanelClass}
        >
          <MoreMenuDesignItems {...props} />
          <MoreMenuModeItems {...props} />
          <MoreMenuViewItems {...props} />
          <MoreMenuFooter {...props} />
          {phone && props.accountSlot ? (
            <div data-testid="editor-command-overflow-account" className="mt-1 border-t border-neutral-200 pt-1">
              {props.accountSlot}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

// New design and My designs come first: both move to another design. Rename design and, on
// phones, Download follow.
function MoreMenuDesignItems({
  menuButtonClass, buttonRef, onClose, showLoadDesign, onNewPlan, onOpenMyDesigns, onDownload, onRenameDesign,
}: CommandBarMoreMenuProps) {
  return (
    <>
      <button
        type="button" role="menuitem" data-testid="editor-command-new-plan" aria-label="Start a new design"
        className={menuButtonClass}
        onClick={() => {
          // The start picker hands focus back to whatever held it, and this item is about to go.
          buttonRef.current?.focus();
          onClose();
          onNewPlan();
        }}
      >
        New design
      </button>
      {showLoadDesign && (
        <button
          type="button" role="menuitem" data-testid="editor-command-overflow-load"
          className={menuButtonClass}
          onClick={() => {
            // If saving first fails, the editor stays open, with focus on More.
            buttonRef.current?.focus();
            onClose();
            onOpenMyDesigns();
          }}
        >
          My designs
        </button>
      )}
      {onRenameDesign ? (
        <button type="button" role="menuitem" data-testid="editor-command-overflow-rename-design"
          className={`${menuButtonClass} md:hidden`}
          onClick={() => {
            // Rename design hands focus back to More when the bar has no design name.
            buttonRef.current?.focus();
            onClose();
            onRenameDesign();
          }}
        >
          Rename design
        </button>
      ) : null}
      {onDownload ? (
        <button type="button" role="menuitem" data-testid="editor-command-overflow-download"
          className={`${menuButtonClass} md:hidden`}
          onClick={() => {
            // The Download dialog hands focus back to More when there is no Download button.
            buttonRef.current?.focus();
            onClose();
            onDownload();
          }}
        >
          Download
        </button>
      ) : null}
    </>
  );
}

function MoreMenuModeItems({
  menuButtonClass,
  onClose,
  isDesigner,
  isClientPreview,
  onToggleDesignerMode,
  onToggleClientPreview,
  onCloseLightingSettings,
}: CommandBarMoreMenuProps) {
  return (
    <>
      <button
        type="button" data-testid="editor-command-overflow-pro-tools" className={menuButtonClass}
        onClick={() => { onClose(); onToggleDesignerMode(); }}
      >
        {isDesigner ? "Exit Pro tools" : "Pro tools"}
      </button>
      {isDesigner && (
        <button
          type="button" data-testid="editor-command-overflow-preview" className={menuButtonClass}
          onClick={() => { onClose(); onCloseLightingSettings(); onToggleClientPreview(); }}
        >
          {isClientPreview ? "Exit preview" : "Preview"}
        </button>
      )}
    </>
  );
}

function MoreMenuViewItems({
  menuButtonClass,
  onClose,
  presentModeActive,
  lightingAvailable,
  onOpenPresentExport,
  onExport,
  onOpenLightingSettings,
}: CommandBarMoreMenuProps) {
  return (
    <>
      <button
        type="button"
        role="menuitem"
        data-testid="editor-workflow-export"
        data-active={presentModeActive ? "true" : "false"}
        className={menuButtonClass}
        onClick={() => {
          onClose();
          onExport();
        }}
      >
        {presentModeActive ? "Back to editing" : "Present & export"}
      </button>
      {presentModeActive && (
        <button
          type="button" data-testid="editor-command-overflow-present-export" className={menuButtonClass}
          onClick={() => { onClose(); onOpenPresentExport(); }}
        >
          Export & Camera
        </button>
      )}
      {lightingAvailable ? (
        <button
          type="button"
          role="menuitem"
          data-testid="editor-command-overflow-lighting"
          className={menuButtonClass}
          onClick={() => {
            onClose();
            onOpenLightingSettings();
          }}
        >
          Lighting settings
        </button>
      ) : null}
    </>
  );
}

function MoreMenuFooter({ menuButtonClass, onClose, overflowSlot, onFeedback }: CommandBarMoreMenuProps) {
  return (
    <>
      {overflowSlot ? (
        <div className="mt-1 border-t border-neutral-200 pt-1">
          {overflowSlot}
        </div>
      ) : null}
      <div className="mt-1 border-t border-neutral-200 pt-1">
        <button
          type="button"
          data-testid="beta-feedback-open"
          className={menuButtonClass}
          onClick={() => {
            onClose();
            onFeedback();
          }}
        >
          Feedback
        </button>
      </div>
    </>
  );
}
