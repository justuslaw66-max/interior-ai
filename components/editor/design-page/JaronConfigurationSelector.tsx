"use client";

import { ChoiceTile } from "@/components/ui/ChoiceTile";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
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
}: {
  diagram: JaronConfigurationDiagramKey;
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
  actions: JaronConfigurationSelectorActions;
};

export function JaronConfigurationSelector({
  state,
  actions,
}: JaronConfigurationSelectorProps) {
  const activeGroup = state.groups.find((group) => group.key === state.activeGroupKey);

  return (
    <div className="pt-3" data-testid="jaron-configuration-selector">
      <div className="text-sm font-semibold text-neutral-900">
        Configuration
      </div>

      <SegmentedControl
        label="Configuration type"
        size="compact"
        fill
        className="mt-2"
        value={state.activeGroupKey}
        onChange={actions.onSelectGroup}
        options={state.groups.map((group) => ({
          value: group.key,
          label: group.label,
          testId: `jaron-config-tab-${group.key}`,
          disabled: group.disabled,
        }))}
      />

      <div className="mt-2 space-y-2">
        {activeGroup?.options.map((option) => {
          const active = option.key === state.activeOptionKey;

          return (
            <ChoiceTile
              key={option.key}
              selected={active}
              data-testid={`jaron-config-option-${option.key}`}
              data-active={active ? "true" : "false"}
              className="block w-full px-3 py-3 text-left"
              disabled={option.disabled}
              onClick={() => actions.onSelectOption(option.key)}
            >
              <span className="flex items-center gap-3">
                <span className="flex h-14 w-24 shrink-0 items-center justify-center">
                  <JaronConfigurationDiagram diagram={option.diagram} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{option.label}</span>
                  <span className="mt-1 block text-xs text-neutral-500">
                    {option.description}
                  </span>
                </span>
              </span>
            </ChoiceTile>
          );
        })}
      </div>

      {state.armOptions.length ? (
        <div className="mt-3">
          <div className="text-sm font-semibold text-neutral-900">
            Arm style
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {state.armOptions.map((option) => {
              const active = option.key === state.activeArmKey;

              return (
                <ChoiceTile
                  key={option.key}
                  selected={active}
                  data-testid={`jaron-arm-${option.key}`}
                  data-active={active ? "true" : "false"}
                  className="px-3 py-2 text-sm"
                  disabled={option.disabled}
                  onClick={() => actions.onSelectArm(option.key)}
                  title={option.label}
                >
                  {option.label}
                </ChoiceTile>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
