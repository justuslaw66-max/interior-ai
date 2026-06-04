"use client";

import Image from "next/image";
import { useState } from "react";

type Props = {
  src?: string;
  fallbackSrc?: string;
  alt: string;
  className?: string;
  onError?: () => void;
  onLoad?: () => void;
  testId?: string;
};

/**
 * A lazy-loading image component with IntersectionObserver.
 * Shows a loading skeleton until the image is visible in the viewport.
 * Falls back to a neutral placeholder if the image fails to load.
 */
export default function LazyImage({ src, fallbackSrc, alt, className = "", onError, onLoad, testId }: Props) {
  const normalizedSrc = String(src ?? "").trim();
  const normalizedFallbackSrc = String(fallbackSrc ?? "").trim();
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const primaryFailed = failedSrc === normalizedSrc;
  const activeSrc =
    primaryFailed && normalizedFallbackSrc ? normalizedFallbackSrc : normalizedSrc;
  const hasError = Boolean(activeSrc && failedSrc === activeSrc);
  const isLoaded = loadedSrc === activeSrc && !hasError;

  const handleLoad = () => {
    setLoadedSrc(activeSrc);
    onLoad?.();
  };

  const handleError = () => {
    if (normalizedFallbackSrc && activeSrc !== normalizedFallbackSrc) {
      setFailedSrc(activeSrc);
      setLoadedSrc(null);
      return;
    }

    setFailedSrc(activeSrc);
    onError?.();
  };

  const isRemote = /^https?:\/\//i.test(activeSrc);

  if (!activeSrc) {
    return (
      <div className={`flex items-center justify-center bg-neutral-100 ${className}`}>
        <div className="text-xs text-neutral-400">No image</div>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden bg-neutral-100 ${className}`}>
      {/* Loading skeleton */}
      {!isLoaded && (
        <div className="absolute inset-0 animate-pulse bg-linear-to-r from-neutral-100 via-neutral-50 to-neutral-100" />
      )}

      {isRemote ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={activeSrc}
          alt={alt}
          loading="lazy"
          data-testid={testId}
          className={`absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-300 ${
            isLoaded ? "opacity-100" : "opacity-0"
          }`}
          onLoad={handleLoad}
          onError={handleError}
        />
      ) : (
        <Image
          src={activeSrc}
          alt={alt}
          fill
          data-testid={testId}
          className={`object-cover object-center transition-opacity duration-300 ${
            isLoaded ? "opacity-100" : "opacity-0"
          }`}
          onLoad={handleLoad}
          onError={handleError}
          sizes="(max-width: 768px) 100vw, 50vw"
        />
      )}

      {/* Error fallback */}
      {hasError && (
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <div className="text-xs text-neutral-400">Image unavailable</div>
          </div>
        </div>
      )}
    </div>
  );
}
