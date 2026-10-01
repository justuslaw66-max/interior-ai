"use client";

import { useId, useRef, useState } from "react";
import { Camera, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import type { SavedView } from "@/lib/room-types";
import { useDismissibleMenu } from "@/lib/useDismissibleMenu";

export type CanvasSavedViewsState = {
  /** The active room's saved views. */
  views: readonly SavedView[];
  nameInput: string;
};

export type CanvasSavedViewsActions = {
  onNameChange: (name: string) => void;
  onSave: () => void;
  onOpen: (view: SavedView) => void;
  onDelete: (viewId: string) => void;
};

export type CanvasSavedViewsProps = CanvasSavedViewsState & CanvasSavedViewsActions & {
  dark: boolean;
  /** Phones: a 44px button in the view pill; from md, a compact one in the canvas toolbar. */
  size: "pill" | "toolbar";
};

function SavedViewRow({ view, onOpen, onDelete }: { view: SavedView; onOpen: () => void; onDelete: () => void }) {
  return (
    <li className="flex min-w-0 items-center gap-1">
      <button
        type="button"
        data-testid={`saved-camera-view-open-${view.id}`}
        className="min-h-9 min-w-0 flex-1 truncate rounded-lg px-2 text-left text-sm font-medium text-neutral-900 hover:bg-neutral-100 touch:min-h-11"
        onClick={onOpen}
      >
        {view.name}
      </button>
      <Button
        variant="quiet"
        size="icon"
        data-testid={`saved-camera-view-delete-${view.id}`}
        aria-label={`Delete ${view.name}`}
        title={`Delete ${view.name}`}
        onClick={onDelete}
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </Button>
    </li>
  );
}

function SavedViewsPanel(props: CanvasSavedViewsProps & { id: string; headingId: string }) {
  const { views } = props;
  return (
    <div
      id={props.id}
      role="dialog"
      aria-labelledby={props.headingId}
      data-testid="canvas-saved-views-panel"
      data-touch-area
      className="absolute left-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-1.5rem)] rounded-xl border border-neutral-200 bg-white p-3 text-neutral-900 shadow-lg"
    >
      <h2 id={props.headingId} className="text-sm font-semibold">
        Saved views
      </h2>
      {views.length > 0 ? (
        <ul className="mt-2 grid gap-1" data-testid="saved-camera-view-list">
          {views.map((view) => (
            <SavedViewRow
              key={view.id}
              view={view}
              onOpen={() => props.onOpen(view)}
              onDelete={() => props.onDelete(view.id)}
            />
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-xs text-neutral-600">Saved views appear on share links and export packs.</p>
      )}
      <form
        className="mt-3 grid grid-cols-[1fr_auto] gap-2 border-t border-neutral-200 pt-3"
        onSubmit={(event) => {
          event.preventDefault();
          props.onSave();
        }}
      >
        <label htmlFor={`${props.id}-name`} className="sr-only">
          View name
        </label>
        <input
          id={`${props.id}-name`}
          data-testid="camera-view-name-input"
          value={props.nameInput}
          onChange={(event) => props.onNameChange(event.target.value)}
          placeholder={`View ${views.length + 1}`}
          className="min-h-9 min-w-0 rounded-lg border border-neutral-300 px-2 text-sm placeholder:text-neutral-500 touch:min-h-11"
        />
        <Button type="submit" variant="primary" size="compact" data-testid="save-named-camera-view" className="h-9 touch:h-11">
          Save view
        </Button>
      </form>
    </div>
  );
}

/**
 * Saved views on the 3D view (UX audit SX4, phase 4e; J's Q5): a Views button beside 2D | 3D opens
 * the active room's saved views, with a name and Save for the current one. They used to live in
 * Present & export. The panel closes on Escape, handing focus back to Views, or a press outside it.
 */
export function CanvasSavedViews(props: CanvasSavedViewsProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  useDismissibleMenu({
    open,
    containerRef,
    onDismiss: (byKeyboard) => {
      setOpen(false);
      if (byKeyboard) buttonRef.current?.focus();
    },
  });
  const buttonClass =
    props.size === "pill"
      ? "inline-flex h-11 items-center gap-1.5 rounded-[9px] px-3 text-sm font-semibold"
      : "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold touch:h-11";
  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        data-testid="canvas-saved-views"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className={`${buttonClass} ${
          open ? "bg-neutral-900 text-white" : props.dark ? "designer-work-control" : "text-neutral-800 hover:bg-neutral-100"
        }`}
        onClick={() => setOpen((value) => !value)}
      >
        <Camera className="h-4 w-4" aria-hidden="true" />
        Views
      </button>
      {open ? <SavedViewsPanel {...props} id={panelId} headingId={`${panelId}-heading`} /> : null}
    </div>
  );
}
