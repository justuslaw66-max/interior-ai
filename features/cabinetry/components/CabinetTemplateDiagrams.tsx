import { CABINET_MATERIALS } from "../catalog/materials";
import type { CabinetTemplateVisualThumbnailKind } from "../presets";
import type { CabinetDefinition } from "../types";
import type { CabinetWardrobeArrangementOption } from "../wardrobeArrangements";

function CabinetSpecialtyTemplateDiagram({
  kind,
}: {
  kind: Exclude<CabinetTemplateVisualThumbnailKind, "casework">;
}) {
  const commonSvgProps = {
    viewBox: "0 0 240 96",
    className: "h-full w-full",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    focusable: "false" as const,
  };

  switch (kind) {
    case "wall_bed":
      return (
        <svg {...commonSvgProps}>
          <rect x="42" y="9" width="156" height="78" rx="3" fill="#ded8ca" />
          <rect x="72" y="14" width="96" height="68" rx="2" fill="#f8f6f0" />
          <path d="M78 20h84v55H78zM83 70h74M48 18h18M48 31h18M48 44h18M174 18h18M174 31h18M174 44h18" />
          <circle cx="157" cy="48" r="2" fill="currentColor" />
        </svg>
      );
    case "fold_down_desk":
      return (
        <svg {...commonSvgProps}>
          <rect x="68" y="10" width="104" height="59" rx="3" fill="#ded8ca" />
          <path d="M78 18h84v36H78z" fill="#f8f6f0" />
          <path d="M78 53h84l24 25H54z" fill="#c8aa7d" />
          <path d="M68 69h104M62 78h116" />
        </svg>
      );
    case "platform_bed":
      return (
        <svg {...commonSvgProps}>
          <path d="M34 61h172v24H34z" fill="#c8aa7d" />
          <path d="M46 42h148l12 19H34z" fill="#f8f6f0" />
          <path d="M34 17h24v44H34z" fill="#ded8ca" />
          <path d="M91 62v22M149 62v22M40 69h45M97 69h46M155 69h45" />
          <circle cx="77" cy="76" r="1.5" fill="currentColor" />
          <circle cx="135" cy="76" r="1.5" fill="currentColor" />
          <circle cx="193" cy="76" r="1.5" fill="currentColor" />
        </svg>
      );
    case "under_stair":
      return (
        <svg {...commonSvgProps}>
          <path d="M30 82V70h32V58h32V46h32V34h32V22h50" fill="#f8f6f0" />
          <path d="M30 82h178M62 70v12M94 58v24M126 46v36M158 34v48M190 22v60" />
          <path d="M35 73h22M67 61h22M99 49h22M131 37h22M163 25h22" />
          <circle cx="55" cy="76" r="1.5" fill="currentColor" />
          <circle cx="87" cy="64" r="1.5" fill="currentColor" />
          <circle cx="119" cy="52" r="1.5" fill="currentColor" />
          <circle cx="151" cy="40" r="1.5" fill="currentColor" />
          <circle cx="183" cy="28" r="1.5" fill="currentColor" />
        </svg>
      );
    case "room_divider":
      return (
        <svg {...commonSvgProps}>
          <rect x="43" y="10" width="154" height="70" rx="2" fill="#f8f6f0" />
          <path d="M94 10v70M146 10v70M43 34h154M43 57h154" />
          <path d="M34 84h172M50 80v4M190 80v4" strokeWidth="3" />
          <rect x="50" y="16" width="36" height="12" rx="1" fill="#c8aa7d" stroke="none" />
          <rect x="154" y="63" width="35" height="11" rx="1" fill="#ded8ca" stroke="none" />
        </svg>
      );
    case "wall_paneling":
      return (
        <svg {...commonSvgProps}>
          <rect x="24" y="12" width="192" height="72" rx="2" fill="#f8f6f0" />
          {[32, 79, 126, 173].map((x) => (
            <rect key={x} x={x} y="21" width="35" height="53" rx="1" fill="#ded8ca" />
          ))}
          <path d="M24 77h192" strokeWidth="4" />
        </svg>
      );
    case "slat_wall":
      return (
        <svg {...commonSvgProps}>
          <rect x="30" y="9" width="180" height="78" rx="2" fill="#e8e3d8" stroke="none" />
          {Array.from({ length: 12 }, (_, index) => (
            <rect
              key={index}
              x={36 + index * 15}
              y="12"
              width="7"
              height="72"
              rx="2"
              fill="#9b7048"
              stroke="none"
            />
          ))}
        </svg>
      );
    case "ceiling_beams":
      return (
        <svg {...commonSvgProps}>
          <path d="M36 20h168l20 54H16z" fill="#f8f6f0" />
          {[48, 82, 116, 150, 184].map((x) => (
            <path
              key={x}
              d={`M${x} 23h12l13 46H${x - 17}z`}
              fill="#9b7048"
              stroke="none"
            />
          ))}
          <path d="M16 74h208" />
        </svg>
      );
    case "coffered_ceiling":
      return (
        <svg {...commonSvgProps}>
          <path d="M35 17h170l19 62H16z" fill="#f8f6f0" />
          <path d="M77 17 68 79M120 17v62M163 17l9 62M27 43h186M21 62h198" strokeWidth="5" />
        </svg>
      );
    case "fireplace_surround":
      return (
        <svg {...commonSvgProps}>
          <path d="M47 84V27h146v57h-28V48H75v36z" fill="#ded8ca" />
          <rect x="35" y="19" width="170" height="10" rx="2" fill="#c8aa7d" />
          <path d="M75 84V48h90v36M31 84h178" strokeWidth="3" />
          <path d="M84 77V57h72v20" fill="#554136" />
        </svg>
      );
    case "trim_package":
      return (
        <svg {...commonSvgProps}>
          <rect x="25" y="13" width="190" height="72" rx="1" fill="#f8f6f0" />
          <path d="M25 20h190M25 77h190" strokeWidth="7" />
          <path d="M83 77V34h74v43M76 29h88" strokeWidth="6" />
          <path d="M87 73V38h66v35" strokeWidth="2" />
        </svg>
      );
  }
}

export function CabinetTemplateDiagram({
  definition,
  thumbnailKind = "casework",
  testId,
}: {
  definition: CabinetDefinition;
  thumbnailKind?: CabinetTemplateVisualThumbnailKind;
  testId?: string;
}) {
  const materialById = new Map(CABINET_MATERIALS.map((material) => [material.id, material]));
  const modules = definition.modules.slice(0, 5);

  return (
    <div
      aria-hidden="true"
      data-testid={testId}
      data-thumbnail-kind={thumbnailKind}
      className="flex h-24 items-end gap-1 rounded-xl bg-[#ece9e1] px-4 pb-3 pt-4"
    >
      {thumbnailKind !== "casework" ? (
        <CabinetSpecialtyTemplateDiagram kind={thumbnailKind} />
      ) : modules.map((module) => {
        const frontColor = materialById.get(module.frontMaterialId ?? module.materialId)?.color ?? "#d6d3d1";
        const heightRatio = Math.max(0.32, module.height / Math.max(...modules.map((item) => item.height)));
        return (
          <div
            key={module.id}
            className="relative min-w-0 overflow-hidden rounded-sm border border-black/15 shadow-sm"
            style={{ flex: Math.max(1, module.width), height: `${Math.round(heightRatio * 100)}%`, backgroundColor: frontColor }}
          >
            {module.frontType === "double_door" ? <span className="absolute inset-y-0 left-1/2 w-px bg-black/20" /> : null}
            {module.frontType === "single_door" || module.frontType === "double_door" ? (
              <span className="absolute right-1 top-1/2 h-1 w-1 rounded-full bg-black/50" />
            ) : null}
            {module.frontType === "drawer_stack"
              ? Array.from({ length: Math.max(2, Math.min(4, module.drawerCount)) }).map((_, index) => (
                  <span
                    key={index}
                    className="absolute inset-x-0 h-px bg-black/20"
                    style={{ top: `${((index + 1) / Math.max(2, Math.min(4, module.drawerCount))) * 100}%` }}
                  />
                ))
              : null}
            {module.frontType === "open"
              ? Array.from({ length: Math.max(1, Math.min(4, module.shelfCount)) }).map((_, index) => (
                  <span
                    key={index}
                    className="absolute inset-x-1 h-px bg-black/25"
                    style={{ top: `${((index + 1) / (Math.max(1, Math.min(4, module.shelfCount)) + 1)) * 100}%` }}
                  />
                ))
              : null}
          </div>
        );
      })}
    </div>
  );
}

export function CabinetWardrobeArrangementDiagram({
  option,
}: {
  option: CabinetWardrobeArrangementOption;
}) {
  const { visual } = option;
  const drawerHeight = visual.drawerBands > 0 ? 30 / visual.drawerBands : 0;

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 100 100"
      className="h-24 w-full rounded-xl bg-[#ece9e1] p-2 text-neutral-700"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      vectorEffect="non-scaling-stroke"
    >
      <rect x="20" y="8" width="60" height="84" rx="3" fill="currentColor" fillOpacity="0.04" />
      {visual.shelfLevels.map((level) => {
        const y = 88 - level * 76;
        return <path key={`shelf-${level}`} d={`M25 ${y}h50`} opacity="0.64" />;
      })}
      {visual.hangingRodLevels.map((level) => {
        const y = 88 - level * 76;
        return (
          <g key={`rod-${level}`}>
            <path d={`M27 ${y}h46`} strokeWidth="3" strokeLinecap="round" />
            <path
              d={`M37 ${y + 3}v6l-7 8h14l-7-8M58 ${y + 3}v6l-7 8h14l-7-8`}
              opacity="0.45"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </g>
        );
      })}
      {Array.from({ length: visual.drawerBands }, (_, index) => {
        const y = 88 - drawerHeight * (index + 1);
        return (
          <g key={`drawer-${index}`}>
            <rect x="25" y={y} width="50" height={drawerHeight - 2} rx="1.5" opacity="0.62" />
            <path d={`M46 ${y + (drawerHeight - 2) / 2}h8`} opacity="0.78" strokeLinecap="round" />
          </g>
        );
      })}
      {visual.front === "doors_and_drawer" ? (
        <path d="M50 10v48" opacity="0.18" />
      ) : null}
    </svg>
  );
}
