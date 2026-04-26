"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type QueueFilter = "all" | "scrape" | "normalize" | "review" | "publish";

interface InboxFiltersUIProps {
  initialQueue: QueueFilter;
  initialBlocked: boolean;
}

const STORAGE_KEY = "admin-inbox-filters";

interface StoredFilters {
  queue: QueueFilter;
  blocked: boolean;
}

export function InboxFiltersUI({ initialQueue, initialBlocked }: InboxFiltersUIProps) {
  const [queue, setQueue] = useState<QueueFilter>(initialQueue);
  const [blocked, setBlocked] = useState(initialBlocked);
  const [mounted, setMounted] = useState(false);

  // Load filters from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as StoredFilters;
        setQueue(parsed.queue);
        setBlocked(parsed.blocked);
      }
    } catch {
      // Ignore parsing errors
    }
    setMounted(true);
  }, []);

  // Save filters to localStorage when they change
  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ queue, blocked }));
    } catch {
      // Ignore storage errors
    }
  }, [queue, blocked, mounted]);

  const buildHref = (newQueue: QueueFilter, newBlocked: boolean) => {
    if (newQueue === "all" && !newBlocked) {
      return "/admin/catalog/inbox";
    }
    const params = new URLSearchParams();
    if (newQueue !== "all") {
      params.set("queue", newQueue);
    }
    if (newBlocked) {
      params.set("blocked", "1");
    }
    const queryString = params.toString();
    return queryString ? `/admin/catalog/inbox?${queryString}` : "/admin/catalog/inbox";
  };

  if (!mounted) {
    return null; // Avoid hydration mismatch
  }

  return (
    <section className="rounded-xl border p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {(["all", "scrape", "normalize", "review", "publish"] as QueueFilter[]).map((option) => {
          const href = buildHref(option, blocked);
          const active = queue === option;
          return (
            <Link
              key={option}
              href={href}
              onClick={(e) => {
                e.preventDefault();
                setQueue(option);
                window.history.replaceState({}, "", buildHref(option, blocked));
              }}
              className={`rounded-full border px-3 py-1 ${
                active
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-200 text-neutral-700 hover:bg-neutral-50"
              }`}
            >
              {option === "all" ? "All queues" : `${option[0].toUpperCase()}${option.slice(1)} queue`}
            </Link>
          );
        })}
        <Link
          href={buildHref(queue, !blocked)}
          onClick={(e) => {
            e.preventDefault();
            setBlocked(!blocked);
            window.history.replaceState({}, "", buildHref(queue, !blocked));
          }}
          className={`rounded-full border px-3 py-1 ${
            blocked
              ? "border-red-700 bg-red-700 text-white"
              : "border-neutral-200 text-neutral-700 hover:bg-neutral-50"
          }`}
        >
          {blocked ? "Showing blockers only" : "Blockers only"}
        </Link>
      </div>
    </section>
  );
}
