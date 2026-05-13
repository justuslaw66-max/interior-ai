"use client";

type Props = {
  title: string;
  className?: string;
};

/**
 * A graceful fallback placeholder for missing product images.
 * Shows a consistent, branded look when no image is available.
 */
export default function PlaceholderImage({ title, className = "" }: Props) {
  return (
    <div
      className={`flex flex-col items-center justify-center bg-gradient-to-br from-neutral-50 to-neutral-100 ${className}`}
    >
      <div className="text-4xl text-neutral-200">📦</div>
      <div className="mt-2 text-center px-2">
        <div className="text-xs font-medium text-neutral-500">Image unavailable</div>
        <div className="mt-1 line-clamp-2 text-[10px] text-neutral-400">{title}</div>
      </div>
    </div>
  );
}
