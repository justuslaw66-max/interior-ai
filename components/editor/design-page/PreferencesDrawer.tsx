"use client";

import { createPortal } from "react-dom";
import { EditorDialog } from "@/components/editor/design-system/EditorDialog";
import { planCursorSvg, planResizeCursor, planRotateCursor } from "@/lib/plan-cursors";
import {
  PLAN_CURSOR_THEME_LABELS,
  PLAN_CURSOR_THEMES,
  setPlanCursorTheme,
  usePlanCursorTheme,
  type PlanCursorTheme,
} from "@/lib/plan-cursor-preference";
import { CLIENT_PREVIEW_FALLBACK_ACTION_ID } from "@/lib/useClientPreviewCommandBarFocus";

const svgSource = (svg: string) => `data:image/svg+xml,${encodeURIComponent(svg)}`;

/** One of a style's cursors, drawn larger; hovering it shows that cursor for real. */
function CursorPicture({ svg, cursor }: { svg: string; cursor: string }) {
  return (
    <span
      aria-hidden="true"
      style={{ backgroundImage: `url("${svgSource(svg)}")`, cursor }}
      className="block h-9 w-9 bg-contain bg-center bg-no-repeat"
    />
  );
}

/** The style's resize and rotate cursors, or "System" for Standard's browser cursors. */
function CursorSample({ theme }: { theme: PlanCursorTheme }) {
  if (theme === "standard") {
    return <span aria-hidden="true" className="flex h-10 w-[84px] shrink-0 items-center justify-center text-xs text-label-secondary">System</span>;
  }
  return (
    <span className="flex h-10 w-[84px] shrink-0 items-center justify-center gap-1 rounded-xl bg-tile">
      <CursorPicture svg={planCursorSvg(theme, "resize")} cursor={planResizeCursor(1, 0, theme)} />
      <CursorPicture svg={planCursorSvg(theme, "rotate")} cursor={planRotateCursor(theme)} />
    </span>
  );
}

/** Cursor style: one choice per style; hovering a style's pictures shows its real cursors. */
export function CursorStylePreference() {
  const selected = usePlanCursorTheme();
  return (
    <fieldset data-testid="preferences-cursor-style">
      <legend className="text-sm font-bold">Cursor style</legend>
      <p className="mt-0.5 text-xs text-label-secondary">How the pointer looks when you resize or turn things on the plan.</p>
      <div className="mt-3 grid gap-2">
        {PLAN_CURSOR_THEMES.map((theme) => {
          const { label, detail } = PLAN_CURSOR_THEME_LABELS[theme];
          const checked = selected === theme;
          return (
            <label
              key={theme}
              data-testid={`preferences-cursor-${theme}`}
              className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 transition focus-within:ring-2 focus-within:ring-control-primary ${
                checked ? "border-control-primary bg-tile" : "border-separator hover:bg-control-secondary-hover"
              }`}
            >
              <input
                type="radio"
                name="plan-cursor-style"
                value={theme}
                checked={checked}
                onChange={() => setPlanCursorTheme(theme)}
                className="sr-only"
              />
              <CursorSample theme={theme} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">{label}</span>
                <span className="mt-0.5 block text-xs text-label-secondary">{detail}</span>
              </span>
              <span
                aria-hidden="true"
                className={`h-4 w-4 shrink-0 rounded-full border-4 ${checked ? "border-control-primary bg-control-on-primary" : "border-control-handle"}`}
              />
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * Preferences: the customer's own settings for this device, starting with the cursor style
 * (J, 13 Nov 2026: one place for more personal options as they come). It opens from More like
 * Lighting settings, as a sheet on phones and down the right side from sm.
 */
export function PreferencesDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return createPortal(
    <EditorDialog
      open
      placement="sheet"
      title="Preferences"
      description="Your settings on this device."
      onClose={onClose}
      closeLabel="Close preferences"
      closeButtonTestId="preferences-close"
      dialogId="preferences-drawer"
      testId="preferences-overlay"
      panelTestId="preferences-drawer"
      returnFocusId={CLIENT_PREVIEW_FALLBACK_ACTION_ID}
      layerClassName="z-[120]"
    >
      <div className="space-y-5">
        <CursorStylePreference />
      </div>
    </EditorDialog>,
    document.body
  );
}
