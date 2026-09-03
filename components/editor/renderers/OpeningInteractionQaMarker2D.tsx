import { Html } from "@react-three/drei/web/Html";

function Marker({ position, testId }: {
  position: [number, number, number];
  testId: string;
}) {
  return (
    <Html center position={position} style={{ pointerEvents: "none" }} zIndexRange={[1, 0]}>
      <span aria-hidden="true" data-testid={testId}
        style={{ display: "block", height: 2, opacity: 0, width: 2 }} />
    </Html>
  );
}

function SelectionMarker({ openingId, onSelect, position, selected }: {
  openingId: string;
  onSelect: () => void;
  position: [number, number, number];
  selected: boolean;
}) {
  return (
    <Html center position={position} style={{ pointerEvents: "none" }} zIndexRange={[1, 0]}>
      <span data-selected={selected ? "true" : "false"}
        data-testid={`qa-opening-select-2d-${openingId}`} hidden
        onClick={(event) => { event.stopPropagation(); onSelect(); }} />
    </Html>
  );
}

export function OpeningInteractionQaMarker2D({ openingId, onSelect, points, selected }: {
  openingId: string;
  onSelect: () => void;
  points: Array<[number, number, number]>;
  selected: boolean;
}) {
  if (process.env.NEXT_PUBLIC_ENABLE_QA_HOOKS !== "1" || points.length < 2) return null;
  const start = points[0];
  const end = points[1];
  const length = Math.hypot(end[0] - start[0], end[2] - start[2]);
  if (length <= 0) return null;
  const center: [number, number, number] = [
    (start[0] + end[0]) / 2, Math.max(start[1], end[1]) + 0.02, (start[2] + end[2]) / 2,
  ];
  const tangent: [number, number, number] = [
    center[0] + (end[0] - start[0]) * 0.3 / length,
    center[1],
    center[2] + (end[2] - start[2]) * 0.3 / length,
  ];
  return (
    <>
      <Marker position={center} testId={`qa-opening-anchor-2d-${openingId}`} />
      <Marker position={tangent} testId={`qa-opening-tangent-2d-${openingId}`} />
      <SelectionMarker openingId={openingId} onSelect={onSelect}
        position={center} selected={selected} />
    </>
  );
}
