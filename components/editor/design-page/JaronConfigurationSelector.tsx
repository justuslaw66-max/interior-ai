"use client";

import type {
  JaronConfigurationArmKey,
  JaronConfigurationDiagramKey,
  JaronConfigurationGroupKey,
} from "@/lib/design-page-model-maps";

const CASTLERY_JARON_CONFIGURATION_ICON_BASE =
  "https://res.cloudinary.com/castlery/image/upload/w_384,f_auto,q_auto";

const JARON_CONFIGURATION_ICON_BY_DIAGRAM: Record<JaronConfigurationDiagramKey, string> = {
  "standard-3-seater": `${CASTLERY_JARON_CONFIGURATION_ICON_BASE}/v1774425945/knight/cms/swatch/icon/Dawson/Sofa_XXXcm.png`,
  "standard-extended-3-seater": `${CASTLERY_JARON_CONFIGURATION_ICON_BASE}/v1774425946/knight/cms/swatch/icon/Dawson/3-Pc_Sofa_XXXcm.png`,
  "chaise-sectional": `${CASTLERY_JARON_CONFIGURATION_ICON_BASE}/v1777345101/knight/cms/swatch/icon/Jaron_Chaise_Sectional_Sofa_Left_Facing.png`,
  "l-shaped-sectional": `${CASTLERY_JARON_CONFIGURATION_ICON_BASE}/v1774425934/knight/cms/swatch/icon/Dawson/5-Pc_L-Shape_Sectional_Sofa.png`,
  "recliner-armchair": `${CASTLERY_JARON_CONFIGURATION_ICON_BASE}/v1774425934/knight/cms/swatch/icon/Dawson/Armchair.png`,
};

function JaronConfigurationDiagram({
  diagram,
  active,
}: {
  diagram: JaronConfigurationDiagramKey;
  active: boolean;
}) {
  const iconSrc = JARON_CONFIGURATION_ICON_BY_DIAGRAM[diagram];

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      aria-hidden="true"
      alt=""
      className="pointer-events-none h-14 w-24 shrink-0 object-contain"
      decoding="async"
      draggable={false}
      loading="lazy"
      src={iconSrc}
      style={{
        filter: active ? "brightness(0) invert(1)" : undefined,
        transform: "scale(1.85)",
        transformOrigin: "center",
      }}
    />
  );
}

export type JaronConfigurationSelectorState = {
  groups: Array<{
    key: JaronConfigurationGroupKey;
    label: string;
    disabled: boolean;
    options: Array<{
      key: string;
      label: string;
      description: string;
      diagram: JaronConfigurationDiagramKey;
      disabled: boolean;
    }>;
  }>;
  activeGroupKey: JaronConfigurationGroupKey;
  activeOptionKey: string | null;
  activeArmKey: JaronConfigurationArmKey;
  armOptions: Array<{
    key: JaronConfigurationArmKey;
    label: string;
    disabled: boolean;
  }>;
};

export type JaronConfigurationSelectorActions = {
  onSelectGroup: (groupKey: JaronConfigurationGroupKey) => void;
  onSelectOption: (optionKey: string) => void;
  onSelectArm: (armKey: JaronConfigurationArmKey) => void;
};

export type JaronConfigurationSelectorProps = {
  state: JaronConfigurationSelectorState;
  configuration: {
    dark: boolean;
  };
  actions: JaronConfigurationSelectorActions;
};

export function JaronConfigurationSelector({
  state,
  configuration,
  actions,
}: JaronConfigurationSelectorProps) {
  const activeGroup = state.groups.find((group) => group.key === state.activeGroupKey);

  return (
    <div className="pt-3" data-testid="jaron-configuration-selector">
      <div
        className={
          configuration.dark
            ? "designer-text-primary text-sm font-semibold"
            : "text-sm font-semibold text-neutral-900"
        }
      >
        Configuration
      </div>

      <div className="mt-2 overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50">
        <div
          className="grid border-b border-neutral-200"
          style={{
            gridTemplateColumns: `repeat(${state.groups.length}, minmax(0, 1fr))`,
          }}
        >
          {state.groups.map((group) => {
            const active = group.key === state.activeGroupKey;

            return (
              <button
                key={group.key}
                data-testid={`jaron-config-tab-${group.key}`}
                data-active={active ? "true" : "false"}
                className={`px-3 py-2 text-xs font-semibold ${
                  active
                    ? "bg-neutral-900 text-white"
                    : configuration.dark
                      ? "designer-text-primary bg-white"
                      : "bg-white text-neutral-900"
                }`}
                disabled={group.disabled}
                onClick={() => actions.onSelectGroup(group.key)}
              >
                {group.label}
              </button>
            );
          })}
        </div>

        <div className="space-y-2 p-2">
          {activeGroup?.options.map((option) => {
            const active = option.key === state.activeOptionKey;

            return (
              <button
                key={option.key}
                data-testid={`jaron-config-option-${option.key}`}
                data-active={active ? "true" : "false"}
                className={`block w-full rounded-lg border px-3 py-3 text-left ${
                  active
                    ? "bg-neutral-900 text-white"
                    : configuration.dark
                      ? "designer-text-primary border-neutral-200 bg-white"
                      : "border-neutral-200 bg-white text-neutral-900"
                }`}
                disabled={option.disabled}
                onClick={() => actions.onSelectOption(option.key)}
              >
                <span className="flex items-center gap-3">
                  <span className="flex h-14 w-24 shrink-0 items-center justify-center">
                    <JaronConfigurationDiagram diagram={option.diagram} active={active} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{option.label}</span>
                    <span
                      className={`mt-1 block text-xs ${
                        active ? "text-white/80" : "text-neutral-500"
                      }`}
                    >
                      {option.description}
                    </span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {state.armOptions.length ? (
        <div className="mt-3">
          <div
            className={
              configuration.dark
                ? "designer-text-primary text-sm font-semibold"
                : "text-sm font-semibold text-neutral-900"
            }
          >
            Arm style
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {state.armOptions.map((option) => {
              const active = option.key === state.activeArmKey;

              return (
                <button
                  key={option.key}
                  data-testid={`jaron-arm-${option.key}`}
                  data-active={active ? "true" : "false"}
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    configuration.dark ? "designer-text-primary" : "text-neutral-900"
                  } ${active ? "designer-accent-border" : "border-neutral-200"}`}
                  disabled={option.disabled}
                  onClick={() => actions.onSelectArm(option.key)}
                  title={option.label}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
