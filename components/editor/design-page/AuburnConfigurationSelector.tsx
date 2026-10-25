"use client";

import { ChoiceTile } from "@/components/ui/ChoiceTile";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
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
  compact = false,
}: {
  diagram: AuburnConfigurationDiagramKey;
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
  actions: AuburnConfigurationSelectorActions;
};

export function AuburnConfigurationSelector({
  state,
  actions,
}: AuburnConfigurationSelectorProps) {
  const activeGroup = state.groups.find((group) => group.key === state.activeGroupKey);

  return (
    <div className="pt-3" data-testid="auburn-configuration-selector">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-sm font-semibold text-label">
          Configuration
        </div>
        <div className="text-xs text-label-secondary">
          {state.configurationCount} configurations
        </div>
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
          testId: `auburn-config-tab-${group.key}`,
          disabled: group.disabled,
        }))}
      />

      <div className="mt-2 max-h-[30rem] space-y-1 overflow-y-auto p-1">
        {activeGroup?.options.map((option) => {
          const active = option.key === state.activeOptionKey;

          return (
            <div key={option.key}>
              <ChoiceTile
                selected={active}
                data-testid={`auburn-config-option-${option.key}`}
                data-active={active ? "true" : "false"}
                className="block w-full px-3 py-3 text-left"
                disabled={option.disabled}
                onClick={() => actions.onSelectOption(option.key)}
              >
                <span className="flex items-center gap-3">
                  <span className="flex h-14 w-24 shrink-0 items-center justify-center">
                    <AuburnConfigurationDiagram diagram={option.diagram} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold leading-snug">
                      {option.label}
                    </span>
                    <span className="mt-1 block text-xs text-label-secondary">
                      {option.description}
                    </span>
                  </span>
                </span>
              </ChoiceTile>

              {active && option.orientations.length ? (
                <div className="px-1 pb-2 pt-3 text-label">
                  <div className="mb-2 text-center text-sm font-semibold">
                    Which orientation would you like?
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {option.orientations.map((orientation) => (
                      <ChoiceTile
                        key={orientation.key}
                        selected={orientation.active}
                        data-testid={`auburn-orientation-${orientation.key}`}
                        data-active={orientation.active ? "true" : "false"}
                        className="flex min-h-16 items-center justify-center gap-2 overflow-hidden px-2 py-2 text-xs font-semibold sm:text-sm"
                        disabled={orientation.disabled}
                        onClick={() => actions.onSelectOrientation(option.key, orientation.key)}
                      >
                        <AuburnConfigurationDiagram diagram={orientation.diagram} compact />
                        <span className="min-w-0 whitespace-nowrap leading-tight">
                          {orientation.label}
                        </span>
                      </ChoiceTile>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
