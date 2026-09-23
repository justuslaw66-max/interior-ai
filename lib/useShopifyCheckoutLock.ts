"use client";

import { useRef, type Dispatch, type SetStateAction } from "react";

export function useShopifyCheckoutLock(
  setBusy: Dispatch<SetStateAction<boolean>>
) {
  const activeRef = useRef(false);
  return {
    active: () => activeRef.current,
    run: async (request: () => Promise<void>) => {
      if (activeRef.current) return;
      activeRef.current = true;
      setBusy(true);
      try {
        await request();
      } finally {
        activeRef.current = false;
        setBusy(false);
      }
    },
  };
}
