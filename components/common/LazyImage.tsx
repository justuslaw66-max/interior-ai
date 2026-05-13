"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

type Props = {
  src?: string;
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
export default function LazyImage({ src, alt, className = "", onError, onLoad, testId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(!src);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  // IntersectionObserver setup for lazy loading
  useEffect(() => {
    if (!src) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: "50px", // Start loading 50px before entering viewport
        threshold: 0.01,
      }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [src]);

  const handleLoad = () => {
    setIsLoaded(true);
    onLoad?.();
  };

  const handleError = () => {
    setHasError(true);
    onError?.();
  };

  if (!src) {
    return (
      <div className={`flex items-center justify-center bg-neutral-100 ${className}`}>
        <div className="text-xs text-neutral-400">No image</div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`relative overflow-hidden bg-neutral-100 ${className}`}>
      {/* Loading skeleton */}
      {!isLoaded && (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-neutral-100 via-neutral-50 to-neutral-100" />
      )}

      {/* Actual image (only renders if visible) */}
      {isVisible && (
        <Image
          src={src}
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
