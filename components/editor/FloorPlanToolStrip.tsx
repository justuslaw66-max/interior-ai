"use client";

type FloorPlanTool = "select" | "draw_room" | "door" | "window";

type FloorPlanToolStripProps = {
  activeTool: FloorPlanTool;
  disabled?: boolean;
  dark?: boolean;
  canAddOpening?: boolean;
  onSelect: () => void;
  onDrawRoom: () => void;
  onAddDoor: () => void;
  onAddWindow: () => void;
  onFitPlan: () => void;
};

const TOOLS: Array<{
  id: FloorPlanTool;
  label: string;
  title: string;
}> = [
  { id: "select", label: "Select", title: "Select and adjust rooms or openings" },
  { id: "draw_room", label: "Draw", title: "Draw a room on the plan" },
  { id: "door", label: "Door", title: "Add a doorway to the active room" },
  { id: "window", label: "Window", title: "Add a window to the active room" },
];

export default function FloorPlanToolStrip({
  activeTool,
  disabled = false,
  dark = false,
  canAddOpening = true,
  onSelect,
  onDrawRoom,
  onAddDoor,
  onAddWindow,
  onFitPlan,
}: FloorPlanToolStripProps) {
  const shellClass = dark
    ? "flex items-center gap-1 rounded-xl border border-white/15 bg-[#12151dcc] p-1 shadow-lg backdrop-blur"
    : "flex items-center gap-1 rounded-xl border border-neutral-200 bg-white/95 p-1 shadow-lg backdrop-blur";
  const buttonBaseClass =
    "h-9 min-w-16 rounded-lg px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-45";
  const activeClass = dark
    ? "bg-white text-neutral-950"
    : "bg-neutral-900 text-white";
  const idleClass = dark
    ? "text-neutral-200 hover:bg-white/10"
    : "text-neutral-700 hover:bg-neutral-100";
  const dividerClass = dark ? "mx-1 h-6 w-px bg-white/15" : "mx-1 h-6 w-px bg-neutral-200";
  const getButtonClass = (tool: FloorPlanTool) =>
    `${buttonBaseClass} ${activeTool === tool ? activeClass : idleClass}`;

  return (
    <div data-testid="floor-plan-tool-strip" className={shellClass}>
      {TOOLS.map((tool) => {
        const isOpeningTool = tool.id === "door" || tool.id === "window";
        const isDisabled = disabled || (isOpeningTool && !canAddOpening);
        const onClick =
          tool.id === "select"
            ? onSelect
            : tool.id === "draw_room"
              ? onDrawRoom
              : tool.id === "door"
                ? onAddDoor
                : onAddWindow;

        return (
          <button
            key={tool.id}
            type="button"
            data-testid={`floor-plan-tool-${tool.id}`}
            className={getButtonClass(tool.id)}
            disabled={isDisabled}
            title={tool.title}
            onClick={onClick}
          >
            {tool.label}
          </button>
        );
      })}
      <div className={dividerClass} />
      <button
        type="button"
        data-testid="floor-plan-tool-fit"
        className={`${buttonBaseClass} ${idleClass}`}
        disabled={disabled}
        title="Fit the full plan in view"
        onClick={onFitPlan}
      >
        Fit
      </button>
    </div>
  );
}
