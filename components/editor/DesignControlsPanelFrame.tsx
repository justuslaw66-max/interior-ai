"use client";

import { PanelLeftOpen, Pin } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { isEditorShortcutTargetBlocked } from "@/lib/editor-shortcut-guard";
import { CANVAS_TOOLBAR_MEDIA_QUERY, useMediaQuery } from "@/lib/useMediaQuery";
import { PhoneStepSheet } from "./PhoneStepSheet";

type DesignControlsPanelFrameProps = {
  dark: boolean;
  isDesigner: boolean;
  collapsed: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  title: string;
  subtitle: string;
  children: ReactNode;
};

/** A collapsed column opens for a moment while the pointer is at the left edge. */
function useEdgePreview() {
  const [edgePreviewOpen, setEdgePreviewOpen] = useState(false);
  const edgePreviewCloseTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelEdgePreviewClose = () => {
    if (edgePreviewCloseTimerRef.current === null) return;
    clearTimeout(edgePreviewCloseTimerRef.current);
    edgePreviewCloseTimerRef.current = null;
  };
  const openEdgePreview = () => {
    cancelEdgePreviewClose();
    setEdgePreviewOpen(true);
  };
  const scheduleEdgePreviewClose = () => {
    cancelEdgePreviewClose();
    edgePreviewCloseTimerRef.current = setTimeout(() => {
      edgePreviewCloseTimerRef.current = null;
      setEdgePreviewOpen(false);
    }, 180);
  };

  useEffect(
    () => () => {
      if (edgePreviewCloseTimerRef.current !== null) {
        clearTimeout(edgePreviewCloseTimerRef.current);
      }
    },
    []
  );
  return { edgePreviewOpen, setEdgePreviewOpen, openEdgePreview, cancelEdgePreviewClose, scheduleEdgePreviewClose };
}

/** Ctrl/⌘ B shows or hides the panel, but not while typing. */
function usePanelToggleShortcut(collapsed: boolean, onCollapsedChange: ((collapsed: boolean) => void) | undefined, onToggle: () => void) {
  useEffect(() => {
    if (!onCollapsedChange) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "b") {
        return;
      }
      if (isEditorShortcutTargetBlocked(event.target)) return;
      event.preventDefault();
      onToggle();
      onCollapsedChange(!collapsed);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [collapsed, onCollapsedChange, onToggle]);
}

/**
 * The step panel's frame. From md, a column beside the canvas: collapsed, a left-edge strip that
 * reveals it on hover, with Keep open to pin it. On phones, a sheet over the canvas (UX 4d), whose
 * peek is the collapsed state. Ctrl/⌘ B shows or hides it at every width.
 */
export function DesignControlsPanelFrame(props: DesignControlsPanelFrameProps) {
  const { dark, collapsed, onCollapsedChange, title, subtitle, children } = props;
  const wide = useMediaQuery(CANVAS_TOOLBAR_MEDIA_QUERY);
  const preview = useEdgePreview();
  const { setEdgePreviewOpen } = preview;
  usePanelToggleShortcut(collapsed, onCollapsedChange, () => setEdgePreviewOpen(false));
  const temporarilyRevealed = Boolean(collapsed && preview.edgePreviewOpen);
  const show = () => {
    setEdgePreviewOpen(false);
    onCollapsedChange?.(false);
  };

  if (!wide) {
    return (
      <PhoneStepSheet dark={dark} title={title} subtitle={subtitle} collapsed={collapsed} onCollapsedChange={onCollapsedChange}>
        {children}
      </PhoneStepSheet>
    );
  }
  if (collapsed && !temporarilyRevealed) {
    return <PanelEdgeReveal dark={dark} openEdgePreview={preview.openEdgePreview} onShow={show} />;
  }
  return (
    <PanelColumn
      {...props}
      temporarilyRevealed={temporarilyRevealed}
      cancelEdgePreviewClose={preview.cancelEdgePreviewClose}
      scheduleEdgePreviewClose={preview.scheduleEdgePreviewClose}
      onKeepOpen={show}
    />
  );
}

function PanelEdgeReveal({ dark, openEdgePreview, onShow }: { dark: boolean; openEdgePreview: () => void; onShow: () => void }) {
  return (
    <div
      data-testid="design-controls-edge-reveal"
      className="group absolute bottom-0 left-0 top-bar-2 z-40 w-4"
      onMouseEnter={openEdgePreview}
    >
      <div
        className={`absolute bottom-3 left-0 top-3 w-1 rounded-r-full transition-colors ${
          dark
            ? "bg-white/20 group-hover:bg-blue-400"
            : "bg-neutral-300 group-hover:bg-blue-500"
        }`}
        aria-hidden="true"
      />
      <button
        type="button"
        data-testid="design-controls-edge-toggle"
        aria-label="Show design sidebar"
        title="Show design sidebar (Ctrl/⌘ B)"
        className={
          dark
            ? "designer-work-control absolute left-1 top-4 flex h-9 w-9 items-center justify-center rounded-xl border opacity-0 shadow-xl transition-opacity focus:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100"
            : "absolute left-1 top-4 flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-800 opacity-0 shadow-xl transition-opacity hover:bg-neutral-50 focus:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100"
        }
        onClick={onShow}
      >
        <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

type PanelColumnProps = DesignControlsPanelFrameProps & {
  temporarilyRevealed: boolean;
  cancelEdgePreviewClose: () => void;
  scheduleEdgePreviewClose: () => void;
  onKeepOpen: () => void;
};

function PanelColumn({ dark, isDesigner, title, subtitle, children, temporarilyRevealed, cancelEdgePreviewClose, scheduleEdgePreviewClose, onKeepOpen }: PanelColumnProps) {
  const panelLeftClass = temporarilyRevealed
    ? "left-0"
    : isDesigner
      ? "left-20"
      : "left-1";
  const panelShellClass = `${dark ? "designer-dock overflow-hidden rounded-xl p-2" : ""} absolute top-bar-2 z-20 w-[18.15rem] space-y-3 pr-1 ${panelLeftClass}`;
  return (
    <div
      data-testid="design-controls-panel"
      data-temporary-reveal={temporarilyRevealed ? "true" : "false"}
      className={`${panelShellClass} max-h-[calc(100vh-var(--editor-bar-h)-2.5rem)] overflow-y-auto pb-4 ${
        temporarilyRevealed ? "z-40 drop-shadow-2xl" : ""
      }`}
      onMouseEnter={cancelEdgePreviewClose}
      onMouseLeave={() => {
        if (temporarilyRevealed) scheduleEdgePreviewClose();
      }}
    >
      <PanelColumnHeader dark={dark} title={title} subtitle={subtitle} temporarilyRevealed={temporarilyRevealed} onKeepOpen={onKeepOpen} />
      {children}
    </div>
  );
}

function PanelColumnHeader({ dark, title, subtitle, temporarilyRevealed, onKeepOpen }: {
  dark: boolean; title: string; subtitle: string; temporarilyRevealed: boolean; onKeepOpen: () => void;
}) {
  const panelHeaderClass = dark
    ? "designer-divider border-b p-3"
    : "rounded-xl border border-neutral-200 bg-white/95 p-3 text-neutral-900 shadow-lg backdrop-blur";
  return (
    <div className={panelHeaderClass}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={dark ? "designer-text-primary text-lg font-semibold" : "text-lg font-semibold text-neutral-950"}>
            {title}
          </div>
          <div className={dark ? "designer-text-secondary mt-1 text-xs" : "mt-1 text-xs text-neutral-500"}>{subtitle}</div>
        </div>
        {temporarilyRevealed ? (
          <button
            type="button"
            data-testid="design-controls-sidebar-toggle"
            aria-label="Keep design tools open"
            title="Keep sidebar open"
            className={
              dark
                ? "designer-work-control inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
                : "inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-semibold text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
            }
            onClick={onKeepOpen}
          >
            <Pin className="h-3.5 w-3.5" aria-hidden="true" />
            Keep open
          </button>
        ) : null}
      </div>
    </div>
  );
}
