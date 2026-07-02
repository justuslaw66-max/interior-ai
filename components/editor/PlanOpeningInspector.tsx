import type { RoomOpening2D } from "@/lib/editorScene";

type PlanOpeningInspectorProps = {
  opening: RoomOpening2D | null;
  roomName: string;
  wallSpanMeters: number;
  maxHeightMeters?: number;
  dark?: boolean;
  onChange: (
    id: string,
    metrics: {
      widthMeters?: number;
      offsetMeters?: number;
      heightMeters?: number;
      kind?: RoomOpening2D["kind"];
    }
  ) => void;
};

export default function PlanOpeningInspector({
  opening,
  roomName,
  wallSpanMeters,
  maxHeightMeters = 3.2,
  dark = false,
  onChange,
}: PlanOpeningInspectorProps) {
  if (!opening) return null;

  return (
    <div
      data-testid="plan-opening-inspector"
      className={
        dark
          ? "space-y-3 rounded-lg border border-neutral-800 bg-[#0f1218] p-3"
          : "space-y-3 rounded-lg border border-gray-200 bg-white p-3"
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div
            className={
              dark
                ? "text-xs font-semibold text-neutral-100"
                : "text-xs font-semibold text-gray-900"
            }
          >
            Opening
          </div>
          <div
            className={
              dark
                ? "mt-0.5 text-[11px] text-neutral-400"
                : "mt-0.5 text-[11px] text-gray-500"
            }
          >
            {opening.kind === "door" ? "Door" : "Window"} on {opening.wall} wall
          </div>
        </div>
        <div
          className={
            dark
              ? "rounded-full bg-neutral-800 px-2 py-1 text-[10px] font-medium text-neutral-200"
              : "rounded-full bg-gray-100 px-2 py-1 text-[10px] font-medium text-gray-600"
          }
        >
          {roomName}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label
          className={
            dark
              ? "text-[11px] font-medium text-neutral-300"
              : "text-[11px] font-medium text-gray-600"
          }
        >
          Type
          <select
            data-testid="plan-opening-kind-input"
            className={
              dark
                ? "mt-1 w-full rounded-md border border-neutral-700 bg-[#151820] px-2 py-2 text-xs text-neutral-100 outline-none focus:border-teal-500"
                : "mt-1 w-full rounded-md border border-gray-200 px-2 py-2 text-xs text-gray-900 outline-none focus:border-teal-500"
            }
            value={opening.kind}
            onChange={(event) =>
              onChange(opening.id, { kind: event.currentTarget.value as RoomOpening2D["kind"] })
            }
          >
            <option value="door">Door</option>
            <option value="window">Window</option>
          </select>
        </label>
        <div
          className={
            dark
              ? "text-[11px] font-medium text-neutral-300"
              : "text-[11px] font-medium text-gray-600"
          }
        >
          Wall span
          <div
            className={
              dark
                ? "mt-1 rounded-md border border-neutral-700 bg-[#151820] px-2 py-2 text-xs text-neutral-100"
                : "mt-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-2 text-xs text-gray-900"
            }
          >
            {wallSpanMeters.toFixed(2)} m
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label
          className={
            dark
              ? "text-[11px] font-medium text-neutral-300"
              : "text-[11px] font-medium text-gray-600"
          }
        >
          Width (m)
          <input
            data-testid="plan-opening-width-input"
            className={
              dark
                ? "mt-1 w-full rounded-md border border-neutral-700 bg-[#151820] px-2 py-2 text-xs text-neutral-100 outline-none focus:border-teal-500"
                : "mt-1 w-full rounded-md border border-gray-200 px-2 py-2 text-xs text-gray-900 outline-none focus:border-teal-500"
            }
            type="number"
            min={0.4}
            max={Math.max(0.4, wallSpanMeters - 0.06)}
            step={0.05}
            value={(opening.widthMm / 1000).toFixed(2)}
            onChange={(event) => {
              const widthMeters = Number.parseFloat(event.target.value);
              if (!Number.isFinite(widthMeters)) return;
              onChange(opening.id, { widthMeters });
            }}
          />
        </label>
        <label
          className={
            dark
              ? "text-[11px] font-medium text-neutral-300"
              : "text-[11px] font-medium text-gray-600"
          }
        >
          Height (m)
          <input
            data-testid="plan-opening-height-input"
            className={
              dark
                ? "mt-1 w-full rounded-md border border-neutral-700 bg-[#151820] px-2 py-2 text-xs text-neutral-100 outline-none focus:border-teal-500"
                : "mt-1 w-full rounded-md border border-gray-200 px-2 py-2 text-xs text-gray-900 outline-none focus:border-teal-500"
            }
            type="number"
            min={0.4}
            max={maxHeightMeters}
            step={0.05}
            value={((opening.heightMm ?? 2100) / 1000).toFixed(2)}
            onChange={(event) => {
              const heightMeters = Number.parseFloat(event.target.value);
              if (!Number.isFinite(heightMeters)) return;
              onChange(opening.id, { heightMeters });
            }}
          />
        </label>
        <label
          className={
            dark
              ? "text-[11px] font-medium text-neutral-300"
              : "text-[11px] font-medium text-gray-600"
          }
        >
          Position (m)
          <input
            data-testid="plan-opening-offset-input"
            className={
              dark
                ? "mt-1 w-full rounded-md border border-neutral-700 bg-[#151820] px-2 py-2 text-xs text-neutral-100 outline-none focus:border-teal-500"
                : "mt-1 w-full rounded-md border border-gray-200 px-2 py-2 text-xs text-gray-900 outline-none focus:border-teal-500"
            }
            type="number"
            step={0.05}
            value={(opening.offsetMm / 1000).toFixed(2)}
            onChange={(event) => {
              const offsetMeters = Number.parseFloat(event.target.value);
              if (!Number.isFinite(offsetMeters)) return;
              onChange(opening.id, { offsetMeters });
            }}
          />
        </label>
      </div>
    </div>
  );
}
