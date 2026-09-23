"use client";

export type FloorStackControlItem = {
  level: number;
  label: string;
  active: boolean;
  hidden: boolean;
  accentColor: string;
};

type FloorStackControlProps = {
  state: {
    floors: FloorStackControlItem[];
  };
  configuration: {
    dark: boolean;
  };
  actions: {
    switchFloor: (level: number) => void;
  };
};

export function FloorStackControl({
  state,
  configuration,
  actions,
}: FloorStackControlProps) {
  return (
    <div
      className={
        configuration.dark
          ? "designer-dock absolute right-[17.5rem] top-24 z-30 hidden flex-col gap-1 rounded-lg p-1 md:flex"
          : "absolute right-[17.5rem] top-24 z-30 hidden flex-col gap-1 rounded-lg border border-neutral-200 bg-white/90 p-1 shadow-xl backdrop-blur md:flex"
      }
      data-testid="floor-stack-control"
      aria-label="Floor stack"
    >
      {state.floors
        .slice()
        .sort((first, second) => second.level - first.level)
        .map((floor) => (
          <button
            key={floor.level}
            type="button"
            className={
              configuration.dark
                ? `grid min-w-12 grid-cols-[auto_1fr] items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold transition ${
                    floor.active
                      ? "bg-blue-500 text-white"
                      : floor.hidden
                        ? "text-neutral-500 hover:bg-white/5"
                        : "text-neutral-200 hover:bg-white/10"
                  }`
                : `grid min-w-12 grid-cols-[auto_1fr] items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold transition ${
                    floor.active
                      ? "bg-blue-600 text-white"
                      : floor.hidden
                        ? "text-neutral-400 hover:bg-neutral-100"
                        : "text-neutral-700 hover:bg-neutral-100"
                  }`
            }
            title={floor.hidden ? `${floor.label} hidden` : floor.label}
            onClick={() => actions.switchFloor(floor.level)}
          >
            <span
              className="h-2.5 w-2.5 rounded-full ring-1 ring-white/50"
              style={{ backgroundColor: floor.accentColor }}
              aria-hidden="true"
            />
            <span>{floor.label}</span>
          </button>
        ))}
    </div>
  );
}
