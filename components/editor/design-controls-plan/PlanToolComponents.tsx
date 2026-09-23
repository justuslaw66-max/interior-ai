import type { ReactNode } from "react";

import {
  PlanToolIcon,
  type PlanToolIconName,
} from "./PlanToolIcon";

export type CollapsiblePlanSection =
  | "floorPlan"
  | "importFloorPlan"
  | "drawRoom"
  | "openings"
  | "templates"
  | "planQuality"
  | "selectedRoom"
  | "connections";

export function CollapsiblePlanHeader({
  section,
  title,
  subtitle,
  accessory,
  collapsed,
  titleClassName,
  metaClassName,
  toggleClassName,
  onToggle,
}: {
  section: CollapsiblePlanSection;
  title: string;
  subtitle?: ReactNode;
  accessory?: ReactNode;
  collapsed: boolean;
  titleClassName: string;
  metaClassName: string;
  toggleClassName: string;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className={titleClassName}>{title}</div>
        {subtitle ? <div className={metaClassName}>{subtitle}</div> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {accessory}
        <button
          type="button"
          data-testid={`plan-section-toggle-${section}`}
          className={toggleClassName}
          aria-label={`${collapsed ? "Expand" : "Collapse"} ${title.toLowerCase()}`}
          aria-expanded={!collapsed}
          onClick={onToggle}
        >
          {collapsed ? "Expand" : "Collapse"}
        </button>
      </div>
    </div>
  );
}

export function PlanToolSection({
  dark,
  section,
  title,
  collapsed,
  children,
  onToggle,
}: {
  dark: boolean;
  section: CollapsiblePlanSection;
  title: string;
  collapsed: boolean;
  children: ReactNode;
  onToggle: () => void;
}) {
  const sectionClass = dark
    ? "border-b border-white/10 last:border-b-0"
    : "border-b border-neutral-100 last:border-b-0";
  const headerClass = dark
    ? "flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-white/5"
    : "flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-neutral-50";
  const titleClass = dark
    ? "text-sm font-semibold text-neutral-100"
    : "text-sm font-semibold text-neutral-800";

  return (
    <section data-testid={`plan-tool-section-${section}`} className={sectionClass}>
      <button
        type="button"
        className={headerClass}
        aria-expanded={!collapsed}
        onClick={onToggle}
      >
        <span className={titleClass}>{title}</span>
        <span
          aria-hidden="true"
          className="text-lg leading-none text-neutral-400"
        >
          {collapsed ? "+" : "-"}
        </span>
      </button>
      {!collapsed ? children : null}
    </section>
  );
}

export function PlanToolTile({
  dark, id, testId,
  icon,
  label,
  shortcut,
  active,
  disabled,
  title,
  onClick,
}: {
  dark: boolean; id?: string;
  testId: string;
  icon: PlanToolIconName;
  label: string;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  onClick?: () => void;
}) {
  const className = [
    "group relative isolate flex min-w-0 flex-col items-center justify-center gap-2 overflow-hidden rounded-[2px] border px-1.5 py-2 text-center transition-[transform,background-color,border-color,box-shadow] duration-150 focus:outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-blue-500/70 focus-visible:ring-offset-2 active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none",
    disabled
      ? dark
        ? "cursor-not-allowed border-transparent bg-white/[0.035] text-neutral-400 focus-visible:ring-offset-[var(--bg-panel)]"
        : "cursor-not-allowed border-transparent bg-[#f6f6f7] text-neutral-500 focus-visible:ring-offset-white"
      : active
        ? dark
          ? "border-blue-400/70 bg-blue-400/15 text-blue-100 shadow-[inset_0_0_0_1px_rgba(96,165,250,0.12)] hover:bg-blue-400/20 focus-visible:ring-offset-[var(--bg-panel)]"
          : "border-blue-400 bg-blue-50 text-neutral-950 shadow-[inset_0_0_0_1px_rgba(96,165,250,0.12)] hover:bg-blue-100/70 focus-visible:ring-offset-white"
        : dark
          ? "border-transparent bg-white/[0.055] text-neutral-100 hover:border-white/15 hover:bg-white/10 focus-visible:ring-offset-[var(--bg-panel)]"
          : "border-transparent bg-[#f6f6f7] text-[#30333a] hover:border-[#d9dce0] hover:bg-[#f1f2f3] focus-visible:ring-offset-white",
  ].join(" ");

  return (
    <button
      id={id} type="button"
      data-testid={testId}
      data-active={active ? "true" : "false"}
      data-disabled={disabled ? "true" : "false"}
      aria-pressed={typeof active === "boolean" ? active : undefined}
      aria-keyshortcuts={shortcut}
      aria-label={disabled && title ? `${label}. ${title}` : undefined}
      className={className}
      disabled={disabled}
      title={title}
      onClick={onClick}
    >
      <PlanToolIcon name={icon} dark={dark} muted={disabled} />
      <span
        className={[
          "block text-[12px] font-normal leading-[1.25] tracking-normal",
          disabled
            ? dark
              ? "text-neutral-400"
              : "text-[#64686f]"
            : dark
              ? "text-neutral-100"
              : "text-[#30333a]",
        ].join(" ")}
      >
        {label}
        {shortcut ? (
          <>
            {" "}
            <span
              className={
                dark
                  ? "whitespace-nowrap text-neutral-100"
                  : "whitespace-nowrap text-[#30333a]"
              }
            >
              ({shortcut})
            </span>
          </>
        ) : null}
      </span>
    </button>
  );
}
