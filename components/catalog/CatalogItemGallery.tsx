"use client";

import { useMemo, useState } from "react";
import LazyImage from "@/components/common/LazyImage";
import PlaceholderImage from "@/components/common/PlaceholderImage";
import type { CatalogMediaPresentationMode } from "@/lib/catalog/media-policy";

type Props = {
  images?: string[];
  imageUrl?: string;
  title: string;
  imageClassName?: string;
  presentationMode?: CatalogMediaPresentationMode;
};

function getPremiumViewerImageClassName(imageClassName?: string): string {
  const base = imageClassName ?? "h-full w-full object-cover object-center";
  return base.includes("object-contain")
    ? base.replace("object-contain", "object-cover")
    : base;
}

function getGalleryFrameClassName(mode: CatalogMediaPresentationMode): string {
  const base = "relative aspect-[16/11] w-full overflow-hidden rounded-[1.35rem] shadow-[0_18px_48px_rgba(15,23,42,0.14)] ring-1 ring-neutral-950/10";
  return mode === "lifestyle"
    ? `${base} bg-neutral-950`
    : `${base} bg-white`;
}

function getAmbientImageClassName(mode: CatalogMediaPresentationMode): string {
  if (mode === "lifestyle") {
    return "absolute inset-0 scale-110 bg-cover bg-center opacity-45 blur-2xl";
  }
  if (mode === "swatch") {
    return "absolute inset-0 scale-110 bg-cover bg-center opacity-0 blur-2xl";
  }
  return "absolute inset-0 scale-110 bg-cover bg-center opacity-10 blur-2xl";
}

function getOverlayClassName(mode: CatalogMediaPresentationMode): string {
  return mode === "lifestyle"
    ? "pointer-events-none absolute inset-0 bg-linear-to-b from-black/10 via-transparent to-black/18"
    : "pointer-events-none absolute inset-0 bg-linear-to-b from-white/0 via-transparent to-neutral-950/[0.03]";
}

export default function CatalogItemGallery({
  images,
  imageUrl,
  title,
  imageClassName,
  presentationMode = "studio",
}: Props) {
  const normalizedImages = useMemo(() => {
    const entries = images?.length ? images : imageUrl ? [imageUrl] : [];
    return Array.from(new Set(entries.filter(Boolean)));
  }, [images, imageUrl]);
  const normalizedImagesKey = useMemo(() => normalizedImages.join("|"), [normalizedImages]);

  const [galleryState, setGalleryState] = useState<{
    key: string;
    activeIndex: number;
    failedImages: string[];
  }>({
    key: normalizedImagesKey,
    activeIndex: 0,
    failedImages: [],
  });

  const activeIndex = galleryState.key === normalizedImagesKey ? galleryState.activeIndex : 0;

  const availableImages = useMemo(() => {
    const failedImages =
      galleryState.key === normalizedImagesKey ? galleryState.failedImages : [];
    return normalizedImages.filter((url) => !failedImages.includes(url));
  }, [normalizedImages, galleryState, normalizedImagesKey]);

  const safeActiveIndex = availableImages.length === 0 ? 0 : activeIndex % availableImages.length;
  const activeImage = availableImages[safeActiveIndex] ?? null;
  const hasMultipleImages = availableImages.length > 1;
  const galleryImageClassName = getPremiumViewerImageClassName(imageClassName);
  const imageCanvasClassName =
    presentationMode === "lifestyle" ? "h-full w-full bg-transparent" : "h-full w-full bg-white";

  return (
    <div
      data-testid="catalog-item-gallery"
      data-presentation-mode={presentationMode}
      className={getGalleryFrameClassName(presentationMode)}
    >
      {activeImage ? (
        <>
          <div
            aria-hidden="true"
            className={getAmbientImageClassName(presentationMode)}
            style={{ backgroundImage: `url(${activeImage})` }}
          />
          <LazyImage
            src={activeImage}
            alt={title}
            className={imageCanvasClassName}
            imageClassName={galleryImageClassName}
            testId="catalog-gallery-image"
            onError={() => {
              setGalleryState((prev) => {
                const base =
                  prev.key === normalizedImagesKey
                    ? prev
                    : { key: normalizedImagesKey, activeIndex: 0, failedImages: [] as string[] };
                return base.failedImages.includes(activeImage)
                  ? base
                  : { ...base, failedImages: [...base.failedImages, activeImage] };
              });
            }}
          />
          <div
            aria-hidden="true"
            className={getOverlayClassName(presentationMode)}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-[1.35rem] ring-1 ring-inset ring-neutral-950/10"
          />
          {hasMultipleImages && (
            <>
              <button
                type="button"
                onClick={() => {
                  setGalleryState((prev) => {
                    const base =
                      prev.key === normalizedImagesKey
                        ? prev
                        : { key: normalizedImagesKey, activeIndex: 0, failedImages: [] as string[] };
                    const length = availableImages.length;
                    if (length <= 1) return base;
                    return {
                      ...base,
                      activeIndex: (base.activeIndex - 1 + length) % length,
                    };
                  });
                }}
                className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/45 bg-white/82 text-base font-semibold text-neutral-950 shadow-lg shadow-black/18 backdrop-blur-md transition hover:bg-white"
                aria-label="Previous image"
              >
                &lt;
              </button>
              <button
                type="button"
                onClick={() => {
                  setGalleryState((prev) => {
                    const base =
                      prev.key === normalizedImagesKey
                        ? prev
                        : { key: normalizedImagesKey, activeIndex: 0, failedImages: [] as string[] };
                    const length = availableImages.length;
                    if (length <= 1) return base;
                    return {
                      ...base,
                      activeIndex: (base.activeIndex + 1) % length,
                    };
                  });
                }}
                className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/45 bg-white/82 text-base font-semibold text-neutral-950 shadow-lg shadow-black/18 backdrop-blur-md transition hover:bg-white"
                aria-label="Next image"
              >
                &gt;
              </button>
              <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-white/20 bg-black/34 px-2.5 py-2 shadow-lg shadow-black/15 backdrop-blur-md">
                {availableImages.map((url, index) => (
                  <button
                    key={url}
                    type="button"
                    data-testid="catalog-gallery-dot"
                    onClick={() => {
                      setGalleryState((prev) => {
                        const base =
                          prev.key === normalizedImagesKey
                            ? prev
                            : { key: normalizedImagesKey, activeIndex: 0, failedImages: [] as string[] };
                        return { ...base, activeIndex: index };
                      });
                    }}
                    aria-label={`View image ${index + 1}`}
                    aria-current={index === safeActiveIndex ? "true" : undefined}
                    className={`h-2.5 rounded-full transition-all ${
                      index === safeActiveIndex
                        ? "w-6 bg-white"
                        : "w-2.5 bg-white/50 hover:bg-white/75"
                    }`}
                  />
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <PlaceholderImage title={title} className="h-full w-full" />
      )}
    </div>
  );
}
