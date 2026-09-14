import { useEffect, useRef, useState } from "react";

function evidenceBounds(svg: SVGSVGElement, ids: Set<string>) {
  const boxes = Array.from(svg.querySelectorAll<SVGGraphicsElement>("[data-review-entity-id]"))
    .filter((element) => ids.has(element.dataset.reviewEntityId ?? ""))
    .map((element) => element.getBBox()).filter((box) => [box.x, box.y, box.width, box.height].every(Number.isFinite));
  if (!boxes.length) return null;
  const left = Math.min(...boxes.map((box) => box.x)), top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width)), bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: (left + right) / 2, y: (top + bottom) / 2, width: Math.max(20, right - left), height: Math.max(20, bottom - top) };
}

/** View-only focus over actual rendered evidence; source coordinates and calibration remain untouched. */
export function useFloorPlanReviewZoom(focusedIds: string[], page: { widthPx: number; heightPx: number; pageNumber: number } | null, context: string) {
  const [zoom, setZoom] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null), svgRef = useRef<SVGSVGElement>(null);
  const focusKey = JSON.stringify([...focusedIds].sort()), width = page?.widthPx, pageNumber = page?.pageNumber;
  useEffect(() => {
    const ids: string[] = JSON.parse(focusKey);
    if (!ids.length || !width) return;
    let settle = 0;
    const frame = requestAnimationFrame(() => {
      const scroll = scrollRef.current, svg = svgRef.current;
      if (!scroll || !svg) return;
      const bounds = evidenceBounds(svg, new Set(ids));
      if (!bounds || !scroll.clientWidth || !scroll.clientHeight) return;
      const baseScale = scroll.clientWidth / width;
      const fit = Math.min(scroll.clientWidth / (bounds.width * baseScale), scroll.clientHeight / (bounds.height * baseScale)) * 0.72;
      setZoom(Math.max(1, Math.min(4, Math.floor(fit * 2) / 2)));
      settle = requestAnimationFrame(() => {
        if (scrollRef.current !== scroll || svgRef.current !== svg) return;
        const scale = svg.getBoundingClientRect().width / width;
        scroll.scrollTo({ left: bounds.x * scale - scroll.clientWidth / 2, top: bounds.y * scale - scroll.clientHeight / 2, behavior: "instant" });
        scroll.scrollIntoView({ block: "nearest", behavior: "instant" });
      });
    });
    return () => { cancelAnimationFrame(frame); cancelAnimationFrame(settle); };
  }, [context, focusKey, pageNumber, width]);
  return { zoom, setZoom, scrollRef, svgRef };
}
