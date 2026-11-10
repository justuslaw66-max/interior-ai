import type { PlanSymbol, PlanSymbolShape, PlanSymbolStroke } from "./plan-symbol-types";

export type PlanSymbolSvgStyle = {
  /** Pixels per metre (1000 draws 1 px per mm). */
  pxPerMetre: number;
  /** Line widths in pixels for each stroke weight. */
  strokePx?: Record<PlanSymbolStroke, number>;
  ink?: string;
  paper?: string;
};

const DEFAULT_STROKES: Record<PlanSymbolStroke, number> = { outline: 1.5, detail: 1, fine: 0.6 };

function n(value: number) {
  return Number(value.toFixed(2)).toString();
}

function escapeAttribute(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function shapeGeometry(shape: PlanSymbolShape, scale: number): string {
  if (shape.type === "rect") {
    const x = (shape.cx - shape.width / 2) * scale;
    const y = (shape.cz - shape.depth / 2) * scale;
    const r = shape.radius > 0 ? ` rx="${n(shape.radius * scale)}"` : "";
    return `<rect x="${n(x)}" y="${n(y)}" width="${n(shape.width * scale)}" height="${n(shape.depth * scale)}"${r}`;
  }
  if (shape.type === "ellipse") {
    return `<ellipse cx="${n(shape.cx * scale)}" cy="${n(shape.cz * scale)}" rx="${n(shape.rx * scale)}" ry="${n(shape.rz * scale)}"`;
  }
  if (shape.type === "arc") {
    const at = (degrees: number) => {
      const radians = (degrees * Math.PI) / 180;
      return `${n((shape.cx + shape.r * Math.cos(radians)) * scale)} ${n((shape.cz + shape.r * Math.sin(radians)) * scale)}`;
    };
    const large = Math.abs(shape.endDeg - shape.startDeg) > 180 ? 1 : 0;
    const sweep = shape.endDeg > shape.startDeg ? 1 : 0;
    const r = n(shape.r * scale);
    return `<path d="M ${at(shape.startDeg)} A ${r} ${r} 0 ${large} ${sweep} ${at(shape.endDeg)}"`;
  }
  const points = shape.points.map(([x, z]) => `${n(x * scale)},${n(z * scale)}`).join(" ");
  return `<${shape.closed ? "polygon" : "polyline"} points="${points}"`;
}

/** One shape as an SVG element, in pixels with the symbol's centre at the origin. */
export function planSymbolShapeSvg(shape: PlanSymbolShape, style: PlanSymbolSvgStyle): string {
  const strokes = style.strokePx ?? DEFAULT_STROKES;
  const width = strokes[shape.stroke];
  const canFill = shape.type !== "arc" && !(shape.type === "polyline" && !shape.closed);
  const fill = shape.fill && canFill ? escapeAttribute(style.paper ?? "#ffffff") : "none";
  const dash = shape.dashed ? ` stroke-dasharray="${n(width * 4)} ${n(width * 3)}"` : "";
  return `${shapeGeometry(shape, style.pxPerMetre)} fill="${fill}" stroke-width="${n(width)}"${dash}/>`;
}

/** The symbol as an SVG group: stroke colour and joins set once, shapes in drawing order. */
export function planSymbolSvgGroup(symbol: PlanSymbol, style: PlanSymbolSvgStyle): string {
  const ink = escapeAttribute(style.ink ?? "#1a1a1a");
  const body = symbol.shapes.map((shape) => planSymbolShapeSvg(shape, style)).join("");
  return `<g data-plan-symbol="${symbol.kind}" stroke="${ink}" stroke-linejoin="round" stroke-linecap="round">${body}</g>`;
}

/** A standalone SVG document holding one symbol, with a small margin. */
export function planSymbolSvgDocument(symbol: PlanSymbol, style: PlanSymbolSvgStyle, marginPx = 4): string {
  const width = symbol.width * style.pxPerMetre + marginPx * 2;
  const height = symbol.depth * style.pxPerMetre + marginPx * 2;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(width)}" height="${n(height)}"`,
    ` viewBox="${n(-width / 2)} ${n(-height / 2)} ${n(width)} ${n(height)}">`,
    planSymbolSvgGroup(symbol, style),
    "</svg>",
  ].join("");
}
