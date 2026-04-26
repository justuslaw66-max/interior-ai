"use client";

import { useMemo, useState } from "react";

type Props = {
  images?: string[];
  imageUrl?: string;
  title: string;
  imageClassName?: string;
};

export default function CatalogItemGallery({ images, imageUrl, title, imageClassName }: Props) {
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

  return (
    <div data-testid="catalog-item-gallery" className="relative aspect-[4/3] overflow-hidden rounded-lg bg-neutral-100">
      {activeImage ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={activeImage}
            alt={title}
            data-testid="catalog-gallery-image"
            className={imageClassName ?? "h-full w-full object-cover object-center"}
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
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/55 px-2.5 py-1.5 text-sm font-semibold text-white hover:bg-black/70"
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
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/55 px-2.5 py-1.5 text-sm font-semibold text-white hover:bg-black/70"
                aria-label="Next image"
              >
                &gt;
              </button>
              <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
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
                    className={`h-2.5 w-2.5 rounded-full ${
                      index === safeActiveIndex ? "bg-white" : "bg-white/45 hover:bg-white/70"
                    }`}
                  />
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <div className="flex h-full items-center justify-center text-xs text-neutral-400">No image</div>
      )}
    </div>
  );
}
