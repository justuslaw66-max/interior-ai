"use client";

import { useCallback } from "react";

import {
  resolveDesignLightingSettings,
  updateDesignLightingSettings,
} from "@/lib/design-lighting-settings";
import {
  LIGHTING_PRESETS,
  type DesignLightingSettings,
  type LightingPreset,
} from "@/lib/lightingPresets";
import { resolveFixturePhotometrics } from "@/lib/resolve-lighting-scene";
import type { DesignItem, DesignSnapshot } from "@/lib/room-types";

type FixturePhotometrics = NonNullable<
  ReturnType<typeof resolveFixturePhotometrics>
>;

type PlacedFixtureEntry = {
  item: DesignItem;
  metadata: FixturePhotometrics;
};

export type DesignPagePresentationLightingState = {
  lightingPreset: LightingPreset;
  lightingSettings: DesignLightingSettings;
  lightingStatus: {
    placedFixtureCount: number;
    activeFixtureCount: number;
    estimatedFixtureCount: number;
  };
};

function resolvePlacedFixtureEntries(
  snapshot: DesignSnapshot
): PlacedFixtureEntry[] {
  return snapshot.rooms.flatMap((room) =>
    room.items.flatMap((item) => {
      const metadata = resolveFixturePhotometrics(item);
      return metadata ? [{ item, metadata }] : [];
    })
  );
}

/** Derives the presentation lighting read model from the canonical document. */
export function buildDesignPagePresentationLightingState(
  snapshot: DesignSnapshot
): DesignPagePresentationLightingState {
  const lightingSettings = resolveDesignLightingSettings(snapshot);
  const fixtureEntries = resolvePlacedFixtureEntries(snapshot);
  const fixturesEnabled =
    lightingSettings.fixtureMasterEnabled &&
    lightingSettings.fixtureMasterLevel > 0;
  const activeFixtureCount = fixturesEnabled
    ? fixtureEntries.filter(
        ({ item }) =>
          (item.fixtureLight?.isOn ??
            LIGHTING_PRESETS[lightingSettings.preset].fixtureDefaultOn) &&
          (item.fixtureLight?.dimmer ?? 1) > 0
      ).length
    : 0;

  return {
    lightingPreset: lightingSettings.preset,
    lightingSettings,
    lightingStatus: {
      placedFixtureCount: fixtureEntries.length,
      activeFixtureCount,
      estimatedFixtureCount: fixtureEntries.filter(
        ({ metadata }) => metadata.verification === "estimated"
      ).length,
    },
  };
}

export type UseDesignPagePresentationLightingRegistrationInput = {
  designSnapshot: DesignSnapshot;
  setDesignSnapshot: (
    next: DesignSnapshot | ((previous: DesignSnapshot) => DesignSnapshot)
  ) => void;
  runHistoryTransaction: (name: string, action: () => void) => void;
};

/**
 * Registers history-aware lighting commands without owning document state.
 * The pure read model above remains independently testable.
 */
export function useDesignPagePresentationLightingRegistration({
  designSnapshot,
  runHistoryTransaction,
  setDesignSnapshot,
}: UseDesignPagePresentationLightingRegistrationInput) {
  const updateLightingSettings = useCallback(
    (patch: Partial<DesignLightingSettings>, transactionName: string) => {
      runHistoryTransaction(transactionName, () => {
        setDesignSnapshot((snapshot) =>
          updateDesignLightingSettings(snapshot, patch)
        );
      });
    },
    [runHistoryTransaction, setDesignSnapshot]
  );
  const changeLightingPreset = useCallback(
    (preset: LightingPreset) => {
      updateLightingSettings({ preset }, "Change lighting preset");
    },
    [updateLightingSettings]
  );
  const changeShadowsEnabled = useCallback(
    (shadowsEnabled: boolean) => {
      updateLightingSettings({ shadowsEnabled }, "Toggle scene shadows");
    },
    [updateLightingSettings]
  );

  return {
    state: buildDesignPagePresentationLightingState(designSnapshot),
    actions: {
      lighting: {
        changeShadowsEnabled,
        updateSettings: (patch: Partial<DesignLightingSettings>) =>
          updateLightingSettings(patch, "Change lighting settings"),
      },
      presentation: { changeLightingPreset },
    },
  };
}
