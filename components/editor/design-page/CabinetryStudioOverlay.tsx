"use client";

import type { MutableRefObject } from "react";

import { track } from "@/lib/analytics";
import CabinetryStudio, {
  type CabinetryStudioProps,
} from "@/features/cabinetry/components/CabinetryStudio";
import { CabinetMeasurementUnitProvider } from "@/features/cabinetry/components/CabinetMeasurementUnitContext";
import type { CabinetDefinition } from "@/features/cabinetry/types";
import type { PlanMeasurementUnit } from "@/lib/design-page-types";

export type CabinetryStudioOverlayState = {
  mode: "create" | "edit";
  instanceId?: string;
  initialDefinition?: CabinetDefinition;
};

export function CabinetryStudioOverlay({
  state,
  enabled,
  accessLevel,
  measurementUnit,
  availableSpaces,
  preferredSpaceId,
  openedAtRef,
  onSave,
  onPlaceInPlan,
  onDismiss,
}: {
  state: CabinetryStudioOverlayState | null;
  enabled: boolean;
  accessLevel: CabinetryStudioProps["accessLevel"];
  measurementUnit: PlanMeasurementUnit;
  availableSpaces: NonNullable<CabinetryStudioProps["availableSpaces"]>;
  preferredSpaceId: CabinetryStudioProps["preferredSpaceId"];
  openedAtRef: MutableRefObject<number | null>;
  onSave: NonNullable<CabinetryStudioProps["onSave"]>;
  onPlaceInPlan: NonNullable<CabinetryStudioProps["onPlaceInPlan"]>;
  onDismiss: () => void;
}) {
  if (!state || !enabled) return null;

  const handleCancel = () => {
    track("millwork_studio_closed", {
      access_level: accessLevel,
      studio_mode: state.mode,
      completed: false,
      elapsed_ms:
        openedAtRef.current === null
          ? null
          : Math.max(0, Math.round(performance.now() - openedAtRef.current)),
    });
    openedAtRef.current = null;
    onDismiss();
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/45 p-4 backdrop-blur-sm">
      <div className="h-full overflow-hidden rounded-xl bg-white shadow-2xl">
        <CabinetMeasurementUnitProvider unit={measurementUnit}>
          <CabinetryStudio
            mode={state.mode}
            accessLevel={accessLevel}
            initialDefinition={state.initialDefinition}
            availableSpaces={availableSpaces}
            preferredSpaceId={preferredSpaceId}
            onSave={onSave}
            onPlaceInPlan={onPlaceInPlan}
            onCancel={handleCancel}
          />
        </CabinetMeasurementUnitProvider>
      </div>
    </div>
  );
}
