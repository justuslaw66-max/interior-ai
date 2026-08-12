"use client";

import DesignControlsPanel, {
  type DesignControlsPanelProps,
} from "@/components/editor/DesignControlsPanel";

type DesignControlsPanelActionKey = Extract<
  keyof DesignControlsPanelProps,
  `on${string}`
>;

type DesignControlsPanelConfigurationKey =
  | "dark"
  | "isClientPreview"
  | "isAuthed"
  | "floorPlanLifecycleIdentity"
  | "isDesigner"
  | "canEdit"
  | "canEditPlanGeometry"
  | "aiDesignEnabled"
  | "panelMode";

export type DesignControlsPanelAdapterConfiguration = Pick<
  DesignControlsPanelProps,
  DesignControlsPanelConfigurationKey
>;

export type DesignControlsPanelAdapterState = Omit<
  DesignControlsPanelProps,
  DesignControlsPanelConfigurationKey | DesignControlsPanelActionKey
>;

export type DesignControlsPanelAdapterActions = Pick<
  DesignControlsPanelProps,
  DesignControlsPanelActionKey
>;

export type DesignControlsPanelAdapterProps = {
  configuration: DesignControlsPanelAdapterConfiguration;
  state: DesignControlsPanelAdapterState;
  actions: DesignControlsPanelAdapterActions;
};

export function DesignControlsPanelAdapter({
  configuration,
  state,
  actions,
}: DesignControlsPanelAdapterProps) {
  const props: DesignControlsPanelProps = {
    ...configuration,
    ...state,
    ...actions,
  };

  return <DesignControlsPanel {...props} />;
}
