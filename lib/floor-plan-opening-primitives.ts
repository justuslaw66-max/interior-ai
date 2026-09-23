import type { CompiledFloorPlanOpeningV2 } from "@/lib/floor-plan-compiler-v2";
import type { FloorPlanPointMmV2 } from "@/lib/floor-plan-document-v2";

export type CanonicalOpeningSymbolRole =
  | "host_span"
  | "swing_leaf"
  | "swing_arc"
  | "sliding_panel"
  | "folding_leaf"
  | "fixed_panel"
  | "vent_slat"
  | "open_jamb";

export type CanonicalOpeningSymbolLineV2 = {
  role: CanonicalOpeningSymbolRole;
  points: FloorPlanPointMmV2[];
};

export type CanonicalOpeningRenderIdentityV2 = {
  openingId: string;
  wallId: string;
  kind: CompiledFloorPlanOpeningV2["kind"];
  operation: CompiledFloorPlanOpeningV2["operation"];
  hinge: CompiledFloorPlanOpeningV2["hinge"];
  handing: CompiledFloorPlanOpeningV2["handing"];
  start: FloorPlanPointMmV2;
  end: FloorPlanPointMmV2;
  bottomMm: number;
  topMm: number;
};

function interpolate(
  start: FloorPlanPointMmV2,
  end: FloorPlanPointMmV2,
  ratio: number
): FloorPlanPointMmV2 {
  return {
    xMm: start.xMm + (end.xMm - start.xMm) * ratio,
    zMm: start.zMm + (end.zMm - start.zMm) * ratio,
  };
}

function offsetPoint(
  point: FloorPlanPointMmV2,
  normal: FloorPlanPointMmV2,
  distanceMm: number
) {
  return {
    xMm: point.xMm + normal.xMm * distanceMm,
    zMm: point.zMm + normal.zMm * distanceMm,
  };
}

function handedNormal(opening: CompiledFloorPlanOpeningV2) {
  const dx = opening.end.xMm - opening.start.xMm;
  const dz = opening.end.zMm - opening.start.zMm;
  const length = Math.max(1, Math.hypot(dx, dz));
  const handedSign = opening.handing === "right" ? -1 : 1;
  return {
    xMm: (-dz / length) * handedSign,
    zMm: (dx / length) * handedSign,
  };
}

function arcBetween(
  center: FloorPlanPointMmV2,
  closedPoint: FloorPlanPointMmV2,
  openPoint: FloorPlanPointMmV2,
  steps = 12
) {
  const radius = Math.max(
    1,
    Math.hypot(closedPoint.xMm - center.xMm, closedPoint.zMm - center.zMm)
  );
  const startAngle = Math.atan2(
    closedPoint.zMm - center.zMm,
    closedPoint.xMm - center.xMm
  );
  const endAngle = Math.atan2(openPoint.zMm - center.zMm, openPoint.xMm - center.xMm);
  let sweep = endAngle - startAngle;
  while (sweep > Math.PI) sweep -= Math.PI * 2;
  while (sweep < -Math.PI) sweep += Math.PI * 2;
  return Array.from({ length: steps + 1 }, (_, index) => {
    const angle = startAngle + sweep * (index / steps);
    return {
      xMm: center.xMm + Math.cos(angle) * radius,
      zMm: center.zMm + Math.sin(angle) * radius,
    };
  });
}

function swingLeafLines(opening: CompiledFloorPlanOpeningV2) {
  const normal = handedNormal(opening);
  const length = Math.max(1, opening.widthMm);
  const leaves: CanonicalOpeningSymbolLineV2[] = [];
  if (opening.handing === "double") {
    const center = interpolate(opening.start, opening.end, 0.5);
    for (const [hinge, closedPoint] of [
      [opening.start, center],
      [opening.end, center],
    ] as const) {
      const openPoint = offsetPoint(hinge, normal, length / 2);
      leaves.push({ role: "swing_leaf", points: [hinge, openPoint] });
      leaves.push({ role: "swing_arc", points: arcBetween(hinge, closedPoint, openPoint) });
    }
    return leaves;
  }
  const hingeAtEnd = opening.hinge === "end";
  const hinge = hingeAtEnd ? opening.end : opening.start;
  const closedPoint = hingeAtEnd ? opening.start : opening.end;
  const openPoint = offsetPoint(hinge, normal, length);
  leaves.push({ role: "swing_leaf", points: [hinge, openPoint] });
  leaves.push({ role: "swing_arc", points: arcBetween(hinge, closedPoint, openPoint) });
  return leaves;
}

/**
 * Deterministic 2D symbols derived only from a compiled opening record. The
 * first primitive is always the exact host-wall span, shared with the 3D
 * descriptor and selection hit target.
 */
export function buildCanonicalOpeningSymbolLinesV2(
  opening: CompiledFloorPlanOpeningV2
): CanonicalOpeningSymbolLineV2[] {
  const span = { role: "host_span" as const, points: [opening.start, opening.end] };
  const normal = handedNormal(opening);
  const offset = 70;

  if (opening.operation === "open" || opening.kind === "open_passage") {
    return [
      span,
      {
        role: "open_jamb",
        points: [offsetPoint(opening.start, normal, -90), offsetPoint(opening.start, normal, 90)],
      },
      {
        role: "open_jamb",
        points: [offsetPoint(opening.end, normal, -90), offsetPoint(opening.end, normal, 90)],
      },
    ];
  }

  if (opening.operation === "swing") return [span, ...swingLeafLines(opening)];

  if (opening.operation === "sliding") {
    const center = interpolate(opening.start, opening.end, 0.5);
    return [
      span,
      {
        role: "sliding_panel",
        points: [opening.start, center].map((point) => offsetPoint(point, normal, offset)),
      },
      {
        role: "sliding_panel",
        points: [center, opening.end].map((point) => offsetPoint(point, normal, -offset)),
      },
    ];
  }

  if (opening.operation === "folding") {
    const points = Array.from({ length: 5 }, (_, index) => {
      const point = interpolate(opening.start, opening.end, index / 4);
      return offsetPoint(point, normal, index === 0 || index === 4 ? 0 : index % 2 ? 120 : -120);
    });
    return [span, { role: "folding_leaf", points }];
  }

  const fixedLines: CanonicalOpeningSymbolLineV2[] = [
    span,
    {
      role: "fixed_panel",
      points: [opening.start, opening.end].map((point) => offsetPoint(point, normal, offset)),
    },
    {
      role: "fixed_panel",
      points: [opening.start, opening.end].map((point) => offsetPoint(point, normal, -offset)),
    },
  ];
  if (opening.kind === "vent" || opening.kind === "louvre") {
    for (let index = 1; index <= 5; index += 1) {
      const point = interpolate(opening.start, opening.end, index / 6);
      fixedLines.push({
        role: "vent_slat",
        points: [offsetPoint(point, normal, -offset), offsetPoint(point, normal, offset)],
      });
    }
  }
  return fixedLines;
}

export function getCanonicalOpeningRenderIdentityV2(
  opening: CompiledFloorPlanOpeningV2
): CanonicalOpeningRenderIdentityV2 {
  return {
    openingId: opening.id,
    wallId: opening.wallId,
    kind: opening.kind,
    operation: opening.operation,
    hinge: opening.hinge,
    handing: opening.handing,
    start: { ...opening.start },
    end: { ...opening.end },
    bottomMm: opening.bottomMm,
    topMm: opening.topMm,
  };
}
