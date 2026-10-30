"use client";

import { Package } from "lucide-react";

type Props = {
  title: string;
  className?: string;
};

/**
 * A graceful fallback placeholder for missing product images.
 * Shows a consistent, branded look when no image is available: a package icon on the tile colour,
 * which has a dark value (30 Oct 2026; it was a 📦 on a light grey gradient).
 */
export default function PlaceholderImage({ title, className = "" }: Props) {
  return (
    <div className={`flex flex-col items-center justify-center bg-tile ${className}`}>
      <Package className="h-9 w-9 text-label-tertiary" strokeWidth={1.5} aria-hidden="true" />
      <div className="mt-2 text-center px-2">
        <div className="text-xs font-medium text-label-secondary">Image unavailable</div>
        <div className="mt-1 line-clamp-2 text-xs text-label-tertiary">{title}</div>
      </div>
    </div>
  );
}
