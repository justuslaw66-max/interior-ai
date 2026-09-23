"use client";

import type { KeyboardEvent } from "react";

export const CABINET_OUTPUT_TABS = [
  ["overview", "Overview"],
  ["issues", "Issues"],
  ["bom", "BOM"],
  ["materials", "Materials"],
  ["hardware", "Hardware"],
  ["outputs", "Outputs"],
] as const;

export type CabinetOutputTab = (typeof CABINET_OUTPUT_TABS)[number][0];

export function getCabinetOutputTabForKey(
  currentTab: CabinetOutputTab,
  key: string
): CabinetOutputTab | null {
  const currentIndex = CABINET_OUTPUT_TABS.findIndex(([value]) => value === currentTab);

  if (key === "ArrowRight") {
    return CABINET_OUTPUT_TABS[(currentIndex + 1) % CABINET_OUTPUT_TABS.length][0];
  }
  if (key === "ArrowLeft") {
    return CABINET_OUTPUT_TABS[
      (currentIndex - 1 + CABINET_OUTPUT_TABS.length) % CABINET_OUTPUT_TABS.length
    ][0];
  }
  if (key === "Home") return CABINET_OUTPUT_TABS[0][0];
  if (key === "End") return CABINET_OUTPUT_TABS[CABINET_OUTPUT_TABS.length - 1][0];
  return null;
}

export function CabinetOutputTabs({
  value,
  issueCount,
  onChange,
}: {
  value: CabinetOutputTab;
  issueCount: number;
  onChange: (value: CabinetOutputTab) => void;
}) {
  const handleKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentTab: CabinetOutputTab
  ) => {
    const nextTab = getCabinetOutputTabForKey(currentTab, event.key);
    if (nextTab === null) return;

    event.preventDefault();
    onChange(nextTab);
    window.setTimeout(() => {
      document.getElementById(`cabinet-output-tab-${nextTab}`)?.focus();
    }, 0);
  };

  return (
    <div
      role="tablist"
      aria-label="Millwork outputs"
      data-testid="cabinet-output-tabs"
      className="sticky top-0 z-10 grid grid-cols-3 gap-1 rounded-xl border border-neutral-200 bg-white/95 p-1 shadow-sm backdrop-blur"
    >
      {CABINET_OUTPUT_TABS.map(([tabValue, label]) => (
        <button
          key={tabValue}
          id={`cabinet-output-tab-${tabValue}`}
          type="button"
          role="tab"
          data-testid={`cabinet-output-tab-${tabValue}`}
          aria-selected={value === tabValue}
          aria-controls="cabinet-output-panel"
          tabIndex={value === tabValue ? 0 : -1}
          className={`rounded-lg px-2 py-2 text-[10px] font-semibold ${
            value === tabValue
              ? "bg-neutral-950 text-white"
              : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
          }`}
          onClick={() => onChange(tabValue)}
          onKeyDown={(event) => handleKeyDown(event, tabValue)}
        >
          {tabValue === "issues" ? `${label} ${issueCount || ""}` : label}
        </button>
      ))}
    </div>
  );
}
