"use client";

import type {
  AuburnConfigurationDiagramKey,
  AuburnConfigurationGroupKey,
} from "@/lib/design-page-model-maps";

const CASTLERY_AUBURN_CONFIGURATION_ICON_BASE =
  "https://res.cloudinary.com/castlery/image/upload/w_384,f_auto,q_auto";

const AUBURN_CONFIGURATION_ICON_BY_DIAGRAM: Record<
  AuburnConfigurationDiagramKey,
  { src: string; mirror?: boolean }
> = {
  "standard-3-seater": {
    src: `${CASTLERY_AUBURN_CONFIGURATION_ICON_BASE}/v1774425945/knight/cms/swatch/icon/Dawson/Sofa_XXXcm.png`,
  },
  "standard-3-seater-with-ottoman": {
    src: `${CASTLERY_AUBURN_CONFIGURATION_ICON_BASE}/v1774425945/knight/cms/swatch/icon/Dawson/Sofa_with_Ottoman.png`,
  },
  "standard-extended-3-seater": {
    src: `${CASTLERY_AUBURN_CONFIGURATION_ICON_BASE}/v1774425946/knight/cms/swatch/icon/Dawson/3-Pc_Sofa_XXXcm.png`,
  },
  "standard-extended-3-seater-with-ottoman": {
    src: `${CASTLERY_AUBURN_CONFIGURATION_ICON_BASE}/v1774425940/knight/cms/swatch/icon/Dawson/Extended_Sofa_with_Ottoman.png`,
  },
  "curve-3-seater": {
    src: `${CASTLERY_AUBURN_CONFIGURATION_ICON_BASE}/v1777341767/knight/cms/swatch/icon/Auburn/3-Pc_Curve_Sofa.png`,
  },
  "curve-3-seater-with-ottoman": {
    src: `${CASTLERY_AUBURN_CONFIGURATION_ICON_BASE}/v1777341353/knight/cms/swatch/icon/Auburn/Auburn_Performance_Fabric_Curve_Sofa_with_Ottoman.png`,
  },
  "armless-curve-3-seater": {
    src: `${CASTLERY_AUBURN_CONFIGURATION_ICON_BASE}/v1777341758/knight/cms/swatch/icon/Auburn/3-Pc_Armless_Curve_Sofa.png`,
  },
  "armless-curve-3-seater-with-ottoman": {
    src: `${CASTLERY_AUBURN_CONFIGURATION_ICON_BASE}/v1777341353/knight/cms/swatch/icon/Auburn/Auburn_Performance_Fabric_Armless_Curve_Sofa_with_Ottoman.png`,
  },
  "chaise-sectional-left": {
    src: `${CASTLERY_AUBURN_CONFIGURATION_ICON_BASE}/v1774425935/knight/cms/swatch/icon/Dawson/Chaise_Sectional_Sofa_Left_Facing.png`,
  },
  "chaise-sectional-right": {
    src: `${CASTLERY_AUBURN_CONFIGURATION_ICON_BASE}/v1774425935/knight/cms/swatch/icon/Dawson/Chaise_Sectional_Sofa_Left_Facing.png`,
    mirror: true,
  },
  "chaise-sectional-left-with-ottoman": {
    src: `${CASTLERY_AUBURN_CONFIGURATION_ICON_BASE}/v1774489378/knight/cms/swatch/icon/Mori/Chaise-Sectional-Sofa-Left_Facing-with-Ottoman.png`,
  },
  "chaise-sectional-right-with-ottoman": {
    src: `${CASTLERY_AUBURN_CONFIGURATION_ICON_BASE}/v1774489378/knight/cms/swatch/icon/Mori/Chaise-Sectional-Sofa-Left_Facing-with-Ottoman.png`,
    mirror: true,
  },
  sectional: {
    src: `${CASTLERY_AUBURN_CONFIGURATION_ICON_BASE}/v1777341742/knight/cms/swatch/icon/Auburn/4-Piece_L-Shape_Sectional_Sofa.png`,
  },
  "sectional-with-ottoman": {
    src: `${CASTLERY_AUBURN_CONFIGURATION_ICON_BASE}/v1777341742/knight/cms/swatch/icon/Auburn/4-Piece_L-Shape_Sectional_Sofa.png`,
  },
  "curve-l-shape-sectional": {
    src: `${CASTLERY_AUBURN_CONFIGURATION_ICON_BASE}/v1777341742/knight/cms/swatch/icon/Auburn/4-Piece_L-Shape_Sectional_Sofa.png`,
  },
  "curve-l-shape-sectional-with-ottoman": {
    src: `${CASTLERY_AUBURN_CONFIGURATION_ICON_BASE}/v1777341354/knight/cms/swatch/icon/Auburn/Auburn_Performance_Fabric_Curve_L-Shape_Sectional_Sofa_with_Ottoman.png`,
  },
  "l-shape-sectional": {
    src: `${CASTLERY_AUBURN_CONFIGURATION_ICON_BASE}/v1777341353/knight/cms/swatch/icon/Auburn/Auburn_Performance_Fabric_Extended_L-Shape_Sectional_Sofa.png`,
  },
  "l-shape-sectional-with-ottoman": {
    src: `${CASTLERY_AUBURN_CONFIGURATION_ICON_BASE}/v1777341354/knight/cms/swatch/icon/Auburn/Auburn_Performance_Fabric_L-Shape_Sectional_Sofa_with_Ottoman.png`,
  },
};

function AuburnConfigurationDiagram({
  diagram,
  active,
  compact = false,
}: {
  diagram: AuburnConfigurationDiagramKey;
  active: boolean;
  compact?: boolean;
}) {
  const iconSizeClass = compact ? "h-10 w-16" : "h-14 w-24";
  const icon = AUBURN_CONFIGURATION_ICON_BY_DIAGRAM[diagram];
  const iconTransform = `${icon.mirror ? "scaleX(-1) " : ""}scale(${compact ? 1.7 : 1.85})`;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      aria-hidden="true"
      alt=""
      className={`${iconSizeClass} pointer-events-none shrink-0 object-contain`}
      decoding="async"
      draggable={false}
      loading="lazy"
      src={icon.src}
      style={{
        filter: active ? "brightness(0) invert(1)" : undefined,
        transform: iconTransform,
        transformOrigin: "center",
      }}
    />
  );
}

export type AuburnConfigurationSelectorState = {
  configurationCount: number;
  groups: Array<{
    key: AuburnConfigurationGroupKey;
    label: string;
    disabled: boolean;
    options: Array<{
      key: string;
      label: string;
      description: string;
      diagram: AuburnConfigurationDiagramKey;
      disabled: boolean;
      orientations: Array<{
        key: string;
        label: string;
        diagram: AuburnConfigurationDiagramKey;
        active: boolean;
        disabled: boolean;
      }>;
    }>;
  }>;
  activeGroupKey: AuburnConfigurationGroupKey;
  activeOptionKey: string | null;
};

export type AuburnConfigurationSelectorActions = {
  onSelectGroup: (groupKey: AuburnConfigurationGroupKey) => void;
  onSelectOption: (optionKey: string) => void;
  onSelectOrientation: (optionKey: string, orientationKey: string) => void;
};

export type AuburnConfigurationSelectorProps = {
  state: AuburnConfigurationSelectorState;
  configuration: {
    dark: boolean;
  };
  actions: AuburnConfigurationSelectorActions;
};

export function AuburnConfigurationSelector({
  state,
  configuration,
  actions,
}: AuburnConfigurationSelectorProps) {
  const activeGroup = state.groups.find((group) => group.key === state.activeGroupKey);

  return (
    <div className="pt-3" data-testid="auburn-configuration-selector">
      <div className="flex items-baseline justify-between gap-3">
        <div
          className={
            configuration.dark
              ? "designer-text-primary text-sm font-semibold"
              : "text-sm font-semibold text-neutral-900"
          }
        >
          Configuration
        </div>
        <div
          className={
            configuration.dark ? "designer-text-secondary text-xs" : "text-xs text-neutral-500"
          }
        >
          {state.configurationCount} configurations
        </div>
      </div>

      <div className="mt-2 overflow-hidden rounded-lg border border-[#e8ded0] bg-[#fbfaf2]">
        <div
          className="grid border-b border-[#ece4d8] bg-[#f5f1e7]"
          style={{
            gridTemplateColumns: `repeat(${state.groups.length}, minmax(0, 1fr))`,
          }}
        >
          {state.groups.map((group) => {
            const active = group.key === state.activeGroupKey;

            return (
              <button
                key={group.key}
                data-testid={`auburn-config-tab-${group.key}`}
                data-active={active ? "true" : "false"}
                className={`min-h-12 px-3 py-2 text-left text-xs font-semibold tracking-[0.24em] ${
                  active
                    ? "border-b-2 border-[#93452a] text-[#93452a]"
                    : "text-[#4b1225]"
                }`}
                disabled={group.disabled}
                onClick={() => actions.onSelectGroup(group.key)}
              >
                {group.label}
              </button>
            );
          })}
        </div>

        <div className="max-h-[30rem] overflow-y-auto p-2">
          {activeGroup?.options.map((option) => {
            const active = option.key === state.activeOptionKey;

            return (
              <div key={option.key} className="mb-1 last:mb-0">
                <button
                  data-testid={`auburn-config-option-${option.key}`}
                  data-active={active ? "true" : "false"}
                  className={`block w-full rounded-lg px-3 py-3 text-left transition ${
                    active
                      ? "bg-[#4b0f22] text-white"
                      : "text-[#4b1225] hover:bg-white"
                  }`}
                  disabled={option.disabled}
                  onClick={() => actions.onSelectOption(option.key)}
                >
                  <span className="flex items-center gap-3">
                    <span className="flex h-14 w-24 shrink-0 items-center justify-center">
                      <AuburnConfigurationDiagram diagram={option.diagram} active={active} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold leading-snug">
                        {option.label}
                      </span>
                      <span
                        className={`mt-1 block text-xs ${
                          active ? "text-white/80" : "text-[#6f5a61]"
                        }`}
                      >
                        {option.description}
                      </span>
                    </span>
                  </span>
                </button>

                {active && option.orientations.length ? (
                  <div className="rounded-b-lg bg-white px-3 pb-3 pt-2 text-[#4b1225]">
                    <div className="mb-2 text-center text-sm font-semibold">
                      Which orientation would you like?
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {option.orientations.map((orientation) => (
                        <button
                          key={orientation.key}
                          data-testid={`auburn-orientation-${orientation.key}`}
                          data-active={orientation.active ? "true" : "false"}
                          className={`flex min-h-16 items-center justify-center gap-2 overflow-hidden rounded-lg px-2 py-2 text-xs font-semibold sm:text-sm ${
                            orientation.active
                              ? "bg-[#4b0f22] text-white"
                              : "bg-white text-[#4b1225] hover:bg-[#f5f1e7]"
                          }`}
                          disabled={orientation.disabled}
                          onClick={() => actions.onSelectOrientation(option.key, orientation.key)}
                        >
                          <AuburnConfigurationDiagram
                            diagram={orientation.diagram}
                            active={orientation.active}
                            compact
                          />
                          <span className="min-w-0 whitespace-nowrap leading-tight">
                            {orientation.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
