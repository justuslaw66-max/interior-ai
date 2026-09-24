"use client";

import { useEffect, useState } from "react";

import { userFacingErrorMessage } from "@/lib/user-facing-error";

type Me = {
  id?: string;
  email?: string | null;
  plan?: string | null;
};

type UseMeResult = {
  me: Me | null;
  isLoading: boolean;
  error: string | null;
};

export function useMe(): UseMeResult {
  const [me, setMe] = useState<Me | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/me");
        if (!res.ok) {
          throw new Error(`Failed to load /api/me (${res.status})`);
        }
        const data = await res.json().catch(() => ({}));
        if (!alive) return;
        setMe(data ?? null);
        setError(null);
      } catch (err) {
        if (!alive) return;
        setMe(null);
        setError(userFacingErrorMessage(err));
      } finally {
        if (alive) setIsLoading(false);
      }
    };

    load();
    return () => {
      alive = false;
    };
  }, []);

  return { me, isLoading, error };
}
