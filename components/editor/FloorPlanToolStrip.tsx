"use client";

export type FloorPlanTool = "select" | "draw_room" | "door" | "window";

type FloorPlanToolStripProps = {
  activeTool: FloorPlanTool;
  disabled?: boolean;
  dark?: boolean;
  canAddOpening?: boolean;
  onSelect: () => void;
  onDrawRoom: () => void;
  onAddDoor: () => void;
  onAddWindow: () => void;
};

const TOOLS: Array<{
  id: FloorPlanTool;
  label: string;
  title: string;
}> = [
  { id: "select", label: "Select", title: "Select and adjust rooms, doors, or windows" },
  { id: "draw_room", label: "Room", title: "Draw a room on the plan" },
  { id: "door", label: "Door", title: "Add a door to the active room" },
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
}: FloorPlanToolStripProps) {
  const helperText =
    activeTool === "draw_room"
      ? "Draw the room outline."
      : activeTool === "door"
        ? "Click a wall for the door."
        : activeTool === "window"
          ? "Click a wall for the window."
          : "Move or adjust what you select.";
  const shellClass = dark
    ? "designer-work-section mt-2 border-t p-2.5"
    : "mt-2 rounded-lg border border-neutral-200 bg-white p-2.5 text-neutral-900";
  const headerClass = dark
    ? "text-sm font-semibold"
    : "text-sm font-semibold text-neutral-800";
  const toolsClass = "mt-2 grid grid-cols-2 gap-1.5";
  const buttonBaseClass =
    "min-h-10 rounded-lg px-2.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-45";
  const activeClass = dark
    ? "designer-work-control-active"
    : "bg-neutral-900 text-white";
  const idleClass = dark
    ? "designer-work-control border"
    : "border border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-neutral-100";
  const getButtonClass = (tool: FloorPlanTool) =>
    `${buttonBaseClass} ${activeTool === tool ? activeClass : idleClass}`;

  return (
    <div data-testid="floor-plan-tool-strip" className={shellClass} aria-label="Plan tools">
      <div className={headerClass}>Plan tools</div>
      <div className={toolsClass}>
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
      </div>
      <div className={dark ? "designer-work-muted mt-2 text-[11px]" : "mt-2 text-[11px] text-neutral-500"}>
        {helperText}
      </div>
    </div>
  );
}
