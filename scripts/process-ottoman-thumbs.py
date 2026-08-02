#!/usr/bin/env python3
"""
Process Dawson Ottoman product photos into catalog thumbnails.

Usage:
    python3 scripts/process-ottoman-thumbs.py

Input files required (drop these into incoming/dawson-ottoman/originals/):
    - studio.jpg   (or .png) — clean white/light background studio shot
    - hero.jpg     (or .png) — lifestyle shot (room setting)

Output:
    public/assets/thumbs/sofa-real-castlery-dawson-ottoman.png       (472x472)
    public/assets/thumbs/sofa-real-castlery-dawson-ottoman-hero.png  (944x944)
"""

import os
import sys
from pathlib import Path
from typing import Optional
from PIL import Image, ImageOps

WORKSPACE = Path(__file__).parent.parent
ORIGINALS = WORKSPACE / "incoming" / "dawson-ottoman" / "originals"
THUMBS = WORKSPACE / "public" / "assets" / "thumbs"

THUMB_SIZE = 472
HERO_SIZE = 944
# How much padding (as a fraction of image size) to add around the cropped subject
PADDING_RATIO = 0.08
# Background color; matches the warm off-white used across all existing thumbs
BG_COLOR = (248, 246, 243)


def find_source(name: str) -> Optional[Path]:
    """Find a source file with any common image extension."""
    for ext in [".jpg", ".jpeg", ".png", ".webp"]:
        p = ORIGINALS / (name + ext)
        if p.exists():
            return p
    return None


def tight_crop(img: Image.Image, bg_threshold: int = 235, padding_ratio: float = PADDING_RATIO) -> Image.Image:
    """
    Crop to the subject by removing near-white background margins.
    Works best on studio photos with a plain light background.
    """
    # Convert to greyscale for thresholding
    grey = img.convert("L")
    w, h = grey.size
    pixels = list(grey.getdata())

    # Find bounding box of non-background pixels
    min_x, min_y = w, h
    max_x = max_y = 0
    for y in range(h):
        for x in range(w):
            if pixels[y * w + x] < bg_threshold:
                if x < min_x:
                    min_x = x
                if x > max_x:
                    max_x = x
                if y < min_y:
                    min_y = y
                if y > max_y:
                    max_y = y

    if max_x <= min_x or max_y <= min_y:
        print("  Could not detect subject bounds — using full image.")
        return img

    # Add padding
    pad_x = int((max_x - min_x) * padding_ratio)
    pad_y = int((max_y - min_y) * padding_ratio)
    min_x = max(0, min_x - pad_x)
    min_y = max(0, min_y - pad_y)
    max_x = min(w, max_x + pad_x)
    max_y = min(h, max_y + pad_y)

    cropped = img.crop((min_x, min_y, max_x, max_y))
    print(f"  Cropped: {img.size} → {cropped.size} (padding {pad_x}px h, {pad_y}px v)")
    return cropped


def fit_onto_canvas(img: Image.Image, canvas_size: int, bg: tuple = BG_COLOR) -> Image.Image:
    """
    Scale the image to fit within canvas_size×canvas_size, then centre it
    on a square canvas with the given background colour.
    """
    img.thumbnail((canvas_size, canvas_size), Image.LANCZOS)
    canvas = Image.new("RGB", (canvas_size, canvas_size), bg)
    offset_x = (canvas_size - img.width) // 2
    offset_y = (canvas_size - img.height) // 2
    canvas.paste(img, (offset_x, offset_y))
    return canvas


def process_studio(src: Path, out_path: Path, size: int):
    """Process a studio (white-background) photo into a catalog thumbnail."""
    print(f"\nProcessing studio thumbnail: {src.name}")
    img = Image.open(src).convert("RGB")
    print(f"  Source size: {img.size}")
    img = tight_crop(img)
    result = fit_onto_canvas(img, size)
    result.save(out_path, "PNG", optimize=True)
    print(f"  Saved → {out_path.relative_to(WORKSPACE)}  ({size}×{size})")


def process_lifestyle(src: Path, out_path: Path, size: int):
    """
    Process a lifestyle (room-setting) photo into a hero thumbnail.
    Centres a square crop at the subject (lower-middle of frame where ottoman sits),
    then scales to the target size.
    """
    print(f"\nProcessing hero thumbnail: {src.name}")
    img = Image.open(src).convert("RGB")
    print(f"  Source size: {img.size}")
    w, h = img.size
    # For a lifestyle shot the ottoman is typically the dominant element.
    # Take a square crop centred horizontally, biased slightly below centre.
    crop_dim = min(w, h)
    left = (w - crop_dim) // 2
    # Bias the vertical crop toward the bottom half so floor context is included
    bias = int(h * 0.10)
    top = max(0, (h - crop_dim) // 2 + bias)
    top = min(top, h - crop_dim)
    cropped = img.crop((left, top, left + crop_dim, top + crop_dim))
    print(f"  Square-cropped: {img.size} → {cropped.size}")
    result = cropped.resize((size, size), Image.LANCZOS)
    result.save(out_path, "PNG", optimize=True)
    print(f"  Saved → {out_path.relative_to(WORKSPACE)}  ({size}×{size})")


def main():
    studio_src = find_source("studio")
    hero_src = find_source("hero")

    if not studio_src and not hero_src:
        print("ERROR: No source images found.")
        print(f"Please drop your images into:  {ORIGINALS.relative_to(WORKSPACE)}/")
        print("  studio.jpg  — white-background studio shot")
        print("  hero.jpg    — lifestyle/room-setting shot")
        sys.exit(1)

    THUMBS.mkdir(parents=True, exist_ok=True)

    if studio_src:
        out = THUMBS / "sofa-real-castlery-dawson-ottoman.png"
        process_studio(studio_src, out, THUMB_SIZE)
    else:
        print("\nSkipping catalog thumbnail (no studio.jpg found)")

    if hero_src:
        out = THUMBS / "sofa-real-castlery-dawson-ottoman-hero.png"
        process_lifestyle(hero_src, out, HERO_SIZE)
    else:
        print("\nSkipping hero thumbnail (no hero.jpg found)")

    print("\nDone.")


if __name__ == "__main__":
    main()
