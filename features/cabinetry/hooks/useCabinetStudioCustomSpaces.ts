"use client";

import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import {
  capCabinetCustomSpaces,
  readStoredCabinetCustomSpaces,
  writeStoredCabinetCustomSpaces,
} from "../storage/CabinetStudioLocalStorage";
import type { CabinetHostSpace } from "../types";

export interface CabinetStudioCustomSpacesController {
  customSpaces: CabinetHostSpace[];
  setCustomSpaces: Dispatch<SetStateAction<CabinetHostSpace[]>>;
}

export function useCabinetStudioCustomSpaces(
  isProWorkspace: boolean,
  initialSpaces: CabinetHostSpace[],
  pinnedSpaceId?: string
): CabinetStudioCustomSpacesController {
  const [customSpaces, setCustomSpaces] =
    useState<CabinetHostSpace[]>(initialSpaces);
  const [storageReady, setStorageReady] = useState(false);
  const pinnedSpaceIdRef = useRef(pinnedSpaceId);

  useEffect(() => {
    pinnedSpaceIdRef.current = pinnedSpaceId;
  }, [pinnedSpaceId]);

  useEffect(() => {
    if (!isProWorkspace) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const storedSpaces = readStoredCabinetCustomSpaces();
      setCustomSpaces((current) =>
        capCabinetCustomSpaces(
          [...storedSpaces, ...current],
          pinnedSpaceIdRef.current
        )
      );
      setStorageReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [isProWorkspace]);

  useEffect(() => {
    if (!isProWorkspace || !storageReady) return;
    writeStoredCabinetCustomSpaces(customSpaces);
  }, [customSpaces, isProWorkspace, storageReady]);

  return { customSpaces, setCustomSpaces };
}
