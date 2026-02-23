"use client";

import { useEffect, useRef } from "react";
import { identifyUser } from "@/lib/identify";
import { useMe } from "@/hooks/useMe";
import { getAnonId } from "@/lib/anon";
import { loadGuestDesigns, clearGuestDesigns } from "@/lib/guestDesigns";
import { track } from "@/lib/analytics";

export function IdentifyGate({ children }: { children: React.ReactNode }) {
  const { me, isLoading } = useMe();
  const identifiedRef = useRef(false);

  useEffect(() => {
    if (identifiedRef.current) return;
    if (!isLoading && me?.id) {
      identifyUser({
        id: me.id,
        email: me.email ?? undefined,
        plan: me.plan ?? undefined,
      });
      identifiedRef.current = true;
    }
  }, [isLoading, me?.id, me?.email, me?.plan]);

  useEffect(() => {
    if (!me?.id) return;
    try {
      const key = "ph_guest_merged";
      if (sessionStorage.getItem(key)) return;
      const designs = loadGuestDesigns();
      if (designs.length === 0) return;

      sessionStorage.setItem(key, "1");
      const anonymousId = getAnonId();
      fetch("/api/designs/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anonymousId }),
      })
        .then((r) => r.json())
        .then((data) => {
          track("guest_designs_merged", { merged: data?.merged ?? 0 });
          clearGuestDesigns();
        })
        .catch(() => {
          sessionStorage.removeItem(key);
        });
    } catch {
      // ignore storage errors
    }
  }, [me?.id]);

  return <>{children}</>;
}
