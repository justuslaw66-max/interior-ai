"use client";

import { Ellipsis } from "lucide-react";
import type { ReactNode, RefObject } from "react";
import { CLIENT_PREVIEW_FALLBACK_ACTION_ID } from "@/lib/useClientPreviewCommandBarFocus";
import { MY_DESIGNS_COMMAND_ACTION_ID } from "@/lib/my-designs-command-focus";

type CommandBarMoreMenuProps = {
  dark: boolean;
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
  onToggleLoadDesign: () => void;
  onToggleDesignerMode: () => void;
  onToggleClientPreview: () => void;
  onOpenPresentExport: () => void;
  onOpenLightingSettings: () => void;
  onCloseLightingSettings: () => void;
  onFeedback: () => void;
};

/** The command bar's More button and menu. */
export function CommandBarMoreMenu(props: CommandBarMoreMenuProps) {
  const { dark, containerRef, buttonRef, open, onToggle, lightingSettingsOpen } = props;
  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        id={CLIENT_PREVIEW_FALLBACK_ACTION_ID}
        type="button"
        data-testid="editor-command-overflow"
        aria-label="More"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={
          lightingSettingsOpen ? "lighting-settings-drawer" : undefined
        }
        className={
          dark
            ? "designer-control inline-flex h-[30px] w-[30px] items-center justify-center rounded-lg border text-sm font-semibold leading-none sm:w-auto sm:px-3"
            : "inline-flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-neutral-200 bg-white text-sm font-semibold leading-none text-neutral-800 hover:bg-neutral-50 sm:w-auto sm:px-3"
        }
        onClick={onToggle}
      >
        <Ellipsis className="h-4 w-4 sm:hidden" aria-hidden="true" />
        <span className="hidden sm:inline">More</span>
      </button>
      {open && (
        <div
          data-testid="editor-command-overflow-menu"
          role="menu"
          className={props.menuPanelClass}
        >
          <MoreMenuModeItems {...props} />
          <MoreMenuViewItems {...props} />
          <MoreMenuFooter {...props} />
        </div>
      )}
    </div>
  );
}

function MoreMenuModeItems({
  menuButtonClass,
  onClose,
  showLoadDesign,
  isDesigner,
  isClientPreview,
  onToggleLoadDesign,
  onToggleDesignerMode,
  onToggleClientPreview,
  onCloseLightingSettings,
}: CommandBarMoreMenuProps) {
  return (
    <>
      {showLoadDesign && (
        <button
          type="button" role="menuitem" id={MY_DESIGNS_COMMAND_ACTION_ID} data-testid="editor-command-overflow-load"
          className={menuButtonClass}
          onClick={() => {
            onClose();
            onToggleLoadDesign();
          }}
        >
          My designs
        </button>
      )}
      <button
        type="button"
        data-testid="editor-command-overflow-pro-tools"
        className={menuButtonClass}
        onClick={() => {
          onClose();
          onToggleDesignerMode();
        }}
      >
        {isDesigner ? "Exit Pro tools" : "Pro tools"}
      </button>
      {isDesigner && (
        <button
          type="button"
          data-testid="editor-command-overflow-preview"
          className={menuButtonClass}
          onClick={() => {
            onClose();
            onCloseLightingSettings();
            onToggleClientPreview();
          }}
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
  onOpenLightingSettings,
}: CommandBarMoreMenuProps) {
  return (
    <>
      {presentModeActive && (
        <button
          type="button"
          data-testid="editor-command-overflow-present-export"
          className={menuButtonClass}
          onClick={() => {
            onClose();
            onOpenPresentExport();
          }}
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
