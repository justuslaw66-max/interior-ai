"use client";

import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import {
  getCabinetModuleOptionGroupIdForControlTestId,
  type CabinetModuleOptionGroupId,
} from "../moduleOptionGroups";

interface UseCabinetStudioPropertyFocusInput {
  advancedOpen: boolean;
  fabricationOpen: boolean;
  moduleOptionsOpen: boolean;
  explicitlyRevealedModuleOptionGroupId: CabinetModuleOptionGroupId | null;
  setAdvancedOpen: Dispatch<SetStateAction<boolean>>;
  setFabricationOpen: Dispatch<SetStateAction<boolean>>;
  setModuleOptionsOpen: Dispatch<SetStateAction<boolean>>;
  setExplicitlyRevealedModuleOptionGroupId: Dispatch<
    SetStateAction<CabinetModuleOptionGroupId | null>
  >;
  trackStudioInteraction: (
    event: string,
    details?: Record<string, unknown>
  ) => void;
}

export function useCabinetStudioPropertyFocus({
  advancedOpen,
  fabricationOpen,
  moduleOptionsOpen,
  explicitlyRevealedModuleOptionGroupId,
  setAdvancedOpen,
  setFabricationOpen,
  setModuleOptionsOpen,
  setExplicitlyRevealedModuleOptionGroupId,
  trackStudioInteraction,
}: UseCabinetStudioPropertyFocusInput): (controlTestId: string) => void {
  const [pendingControlTestId, setPendingControlTestId] = useState<string | null>(
    null
  );

  const focusPropertyControl = useCallback(
    (controlTestId: string) => {
      setExplicitlyRevealedModuleOptionGroupId(
        getCabinetModuleOptionGroupIdForControlTestId(controlTestId) ?? null
      );
      setModuleOptionsOpen(true);
      setAdvancedOpen(true);
      setFabricationOpen(true);
      trackStudioInteraction("millwork_advanced_controls_opened", {
        section: "property_search",
        control_id: controlTestId,
      });
      setPendingControlTestId(controlTestId);
    },
    [
      setAdvancedOpen,
      setExplicitlyRevealedModuleOptionGroupId,
      setFabricationOpen,
      setModuleOptionsOpen,
      trackStudioInteraction,
    ]
  );

  useEffect(() => {
    if (!pendingControlTestId) return;

    let animationFrame = 0;
    let attempts = 0;
    let cancelled = false;
    const focusWhenMounted = () => {
      if (cancelled) return;
      const element = document.querySelector<HTMLElement>(
        `[data-testid="${pendingControlTestId}"]`
      );
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
        element.focus();
        setPendingControlTestId(null);
        return;
      }
      attempts += 1;
      if (attempts < 60) {
        animationFrame = window.requestAnimationFrame(focusWhenMounted);
      } else {
        setPendingControlTestId(null);
      }
    };

    animationFrame = window.requestAnimationFrame(focusWhenMounted);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationFrame);
    };
  }, [
    advancedOpen,
    explicitlyRevealedModuleOptionGroupId,
    fabricationOpen,
    moduleOptionsOpen,
    pendingControlTestId,
  ]);

  return focusPropertyControl;
}
