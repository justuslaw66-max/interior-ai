"use client";

import type { ReactNode } from "react";
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

type DesignControlsPanelSlotKey = "stepFooter";

export type DesignControlsPanelAdapterConfiguration = Pick<
  DesignControlsPanelProps,
  DesignControlsPanelConfigurationKey
>;

export type DesignControlsPanelAdapterState = Omit<
  DesignControlsPanelProps,
  DesignControlsPanelConfigurationKey | DesignControlsPanelActionKey | DesignControlsPanelSlotKey
>;

export type DesignControlsPanelAdapterActions = Pick<
  DesignControlsPanelProps,
  DesignControlsPanelActionKey
>;

export type DesignControlsPanelAdapterProps = {
  configuration: DesignControlsPanelAdapterConfiguration;
  state: DesignControlsPanelAdapterState;
  actions: DesignControlsPanelAdapterActions;
  /** What the region adds at the foot of the step panel: Pro's plan display (UX 4e). */
  stepFooter?: ReactNode;
};

export function DesignControlsPanelAdapter({
  configuration,
  state,
  actions,
  stepFooter,
}: DesignControlsPanelAdapterProps) {
  const props: DesignControlsPanelProps = {
    ...configuration,
    ...state,
    ...actions,
    stepFooter,
  };

  return <DesignControlsPanel {...props} />;
}
