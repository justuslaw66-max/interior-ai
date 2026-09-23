"use client";

import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import type { CabinetryStudioProps } from "../components/CabinetryStudio.contract";
import {
  dismissCabinetOnboarding,
  isCabinetOnboardingDismissed,
  readCabinetExperiencePreference,
  writeCabinetExperiencePreference,
  type CabinetStudioExperience,
} from "../studioOnboarding";
import {
  readCabinetInspectorPreferences,
  writeCabinetInspectorPreferences,
} from "../storage/CabinetStudioLocalStorage";

interface UseCabinetStudioPreferencesInput {
  isProWorkspace: boolean;
  mode: CabinetryStudioProps["mode"];
  setShowClearances: Dispatch<SetStateAction<boolean>>;
}

export interface CabinetStudioPreferencesController {
  experienceMode: CabinetStudioExperience;
  chooseExperienceMode: (experience: CabinetStudioExperience) => void;
  showOnboarding: boolean;
  showOnboardingHelp: () => void;
  dismissOnboarding: () => void;
  moduleOptionsOpen: boolean;
  setModuleOptionsOpen: Dispatch<SetStateAction<boolean>>;
  advancedOpen: boolean;
  setAdvancedOpen: Dispatch<SetStateAction<boolean>>;
  fabricationOpen: boolean;
  setFabricationOpen: Dispatch<SetStateAction<boolean>>;
}

export function useCabinetStudioPreferences({
  isProWorkspace,
  mode,
  setShowClearances,
}: UseCabinetStudioPreferencesInput): CabinetStudioPreferencesController {
  const [experienceMode, setExperienceMode] = useState<CabinetStudioExperience>(
    !isProWorkspace || mode === "create" ? "guided" : "detailed"
  );
  const [showOnboarding, setShowOnboarding] = useState(mode === "create");
  const [moduleOptionsOpen, setModuleOptionsOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [fabricationOpen, setFabricationOpen] = useState(false);
  const [inspectorPreferencesReady, setInspectorPreferencesReady] =
    useState(false);

  useEffect(() => {
    if (isProWorkspace) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setExperienceMode("guided");
      setShowClearances(false);
    });
    return () => {
      cancelled = true;
    };
  }, [isProWorkspace, setShowClearances]);

  useEffect(() => {
    if (!isProWorkspace) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      if (mode !== "create") {
        setExperienceMode("detailed");
        return;
      }
      const preference = readCabinetExperiencePreference(window.localStorage);
      if (preference) setExperienceMode(preference);
    });
    return () => {
      cancelled = true;
    };
  }, [isProWorkspace, mode]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      if (mode !== "create") {
        setShowOnboarding(false);
        return;
      }
      setShowOnboarding(!isCabinetOnboardingDismissed(window.localStorage));
    });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  useEffect(() => {
    if (!isProWorkspace) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const preferences = readCabinetInspectorPreferences();
      if (preferences) {
        setModuleOptionsOpen(preferences.moduleOptionsOpen);
        setAdvancedOpen(preferences.advancedOpen);
        setFabricationOpen(preferences.fabricationOpen);
      }
      setInspectorPreferencesReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [isProWorkspace]);

  useEffect(() => {
    if (!isProWorkspace || !inspectorPreferencesReady) return;
    writeCabinetInspectorPreferences({
      moduleOptionsOpen,
      advancedOpen,
      fabricationOpen,
    });
  }, [
    advancedOpen,
    fabricationOpen,
    inspectorPreferencesReady,
    isProWorkspace,
    moduleOptionsOpen,
  ]);

  const chooseExperienceMode = useCallback(
    (nextExperience: CabinetStudioExperience) => {
      setExperienceMode(nextExperience);
      if (isProWorkspace) {
        writeCabinetExperiencePreference(
          window.localStorage,
          nextExperience
        );
      }
    },
    [isProWorkspace]
  );

  const dismissOnboarding = useCallback(() => {
    setShowOnboarding(false);
    dismissCabinetOnboarding(window.localStorage);
  }, []);

  const showOnboardingHelp = useCallback(() => {
    setShowOnboarding(true);
  }, []);

  return {
    experienceMode,
    chooseExperienceMode,
    showOnboarding,
    showOnboardingHelp,
    dismissOnboarding,
    moduleOptionsOpen,
    setModuleOptionsOpen,
    advancedOpen,
    setAdvancedOpen,
    fabricationOpen,
    setFabricationOpen,
  };
}
