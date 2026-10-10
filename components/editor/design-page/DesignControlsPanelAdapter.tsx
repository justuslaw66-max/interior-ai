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
  | "canChangeProducts"
  | "canEditPlanGeometry"
  | "aiDesignEnabled"
  | "panelMode";

type DesignControlsPanelSlotKey = "stepFooter" | "furnishFooter";

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
  /** What the region adds above Furnish's own foot: Pro's layout versions. */
  furnishFooter?: ReactNode;
};

export function DesignControlsPanelAdapter({
  configuration,
  state,
  actions,
  stepFooter,
  furnishFooter,
}: DesignControlsPanelAdapterProps) {
  const props: DesignControlsPanelProps = {
    ...configuration,
    ...state,
    ...actions,
    stepFooter,
    furnishFooter,
  };

  return <DesignControlsPanel {...props} />;
}
