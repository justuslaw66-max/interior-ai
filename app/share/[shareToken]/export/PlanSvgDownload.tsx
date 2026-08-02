"use client";

import { useState } from "react";
import { track } from "@/lib/analytics";

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "interior-ai-plan";
}

function ensureStandaloneSvgStyles(svg: SVGSVGElement) {
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = `
    text { font-family: Arial, Helvetica, sans-serif; }
    .fill-gray-900 { fill: #111827; }
    .fill-gray-800 { fill: #1f2937; }
    .fill-gray-700 { fill: #374151; }
    .fill-gray-600 { fill: #4b5563; }
    .fill-gray-500 { fill: #6b7280; }
    .text-\\[13px\\] { font-size: 13px; }
    .text-\\[10px\\] { font-size: 10px; }
    .text-\\[9px\\] { font-size: 9px; }
    .font-semibold { font-weight: 600; }
    .font-bold { font-weight: 700; }
  `;

  const defs = svg.querySelector("defs");
  if (defs) {
    defs.prepend(style);
  } else {
    svg.prepend(style);
  }
}

function addFreeWatermark(svg: SVGSVGElement) {
  const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
  group.setAttribute("aria-label", "Free export watermark");

  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  rect.setAttribute("x", "500");
  rect.setAttribute("y", "318");
  rect.setAttribute("width", "192");
  rect.setAttribute("height", "26");
  rect.setAttribute("rx", "13");
  rect.setAttribute("fill", "#ffffff");
  rect.setAttribute("fill-opacity", "0.86");
  rect.setAttribute("stroke", "#f59e0b");
  rect.setAttribute("stroke-width", "1");

  const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
  text.setAttribute("x", "596");
  text.setAttribute("y", "335");
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("font-size", "11");
  text.setAttribute("font-weight", "700");
  text.setAttribute("fill", "#92400e");
  text.textContent = "Interior AI Free Preview";

  group.append(rect, text);
  svg.append(group);
}

function preparePlanSvg(source: SVGSVGElement, watermarked: boolean) {
  const svg = source.cloneNode(true) as SVGSVGElement;
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svg.setAttribute("width", "720");
  svg.setAttribute("height", "360");
  ensureStandaloneSvgStyles(svg);
  if (watermarked) addFreeWatermark(svg);
  return new XMLSerializer().serializeToString(svg);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function loadImageFromUrl(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image failed to load"));
    image.src = url;
  });
}

export default function PlanSvgDownload({
  targetId,
  title,
  floorLabel,
  shareToken,
  watermarked,
}: {
  targetId: string;
  title: string;
  floorLabel: string;
  shareToken: string;
  watermarked: boolean;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [isPngExporting, setIsPngExporting] = useState(false);

  const getSerializedSvg = () => {
    const source = document.getElementById(targetId);
    if (!(source instanceof SVGSVGElement)) {
      setMessage("2D plan is not ready yet.");
      return null;
    }

    return preparePlanSvg(source, watermarked);
  };

  const handleDownloadSvg = () => {
    const serialized = getSerializedSvg();
    if (!serialized) return;
    const blob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
    downloadBlob(blob, `${slugify(title)}-${slugify(floorLabel)}-2d-plan.svg`);

    track("share_export_2d_plan_svg_downloaded", {
      shared_context: Boolean(shareToken),
      floor_label: floorLabel,
      watermarked,
    });
    setMessage("2D SVG downloaded.");
  };

  const handleDownloadPng = async () => {
    const serialized = getSerializedSvg();
    if (!serialized) return;

    setIsPngExporting(true);
    let svgUrl: string | null = null;
    try {
      const svgBlob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
      svgUrl = URL.createObjectURL(svgBlob);
      const image = await loadImageFromUrl(svgUrl);

      const canvas = document.createElement("canvas");
      canvas.width = 1440;
      canvas.height = 720;
      const context = canvas.getContext("2d");
      if (!context) {
        setMessage("PNG export is not available in this browser.");
        return;
      }
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      const pngBlob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png", 0.92)
      );
      if (!pngBlob) {
        setMessage("PNG export failed. Please try SVG instead.");
        return;
      }

      downloadBlob(pngBlob, `${slugify(title)}-${slugify(floorLabel)}-2d-plan.png`);
      track("share_export_2d_plan_png_downloaded", {
        shared_context: Boolean(shareToken),
        floor_label: floorLabel,
        watermarked,
      });
      setMessage("2D PNG downloaded.");
    } catch {
      setMessage("PNG export failed. Please try SVG instead.");
    } finally {
      if (svgUrl) URL.revokeObjectURL(svgUrl);
      setIsPngExporting(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          data-testid="share-export-plan-png-download"
          onClick={handleDownloadPng}
          disabled={isPngExporting}
          className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-800 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPngExporting ? "Preparing PNG..." : "Download 2D PNG"}
        </button>
        <button
          type="button"
          data-testid="share-export-plan-svg-download"
          onClick={handleDownloadSvg}
          className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-800 hover:bg-neutral-50"
        >
          Download 2D SVG
        </button>
      </div>
      {message ? (
        <div className="text-[11px] text-neutral-500" role="status">
          {message}
        </div>
      ) : null}
    </div>
  );
}
