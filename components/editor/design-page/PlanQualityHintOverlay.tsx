import { Line } from "@react-three/drei/core/Line";
import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";
import type { FloorPlanQualityIssue } from "@/lib/floor-plan-quality";

export interface PlanQualityHintOverlayProps {
  rooms: HousePlanRoom2D[];
  issues: FloorPlanQualityIssue[];
}

export function PlanQualityHintOverlay({
  rooms,
  issues,
}: PlanQualityHintOverlayProps) {
  const hintedIssues = issues
    .filter((issue) => issue.target?.roomId || issue.roomId)
    .slice(0, 4);
  if (hintedIssues.length === 0) return null;

  const roomById = new Map(rooms.map((room) => [room.id, room]));
  const colorForIssue = (issue: FloorPlanQualityIssue) => {
    if (issue.category === "naturalLight") return "#f59e0b";
    if (issue.category === "connections") return "#2563eb";
    if (issue.category === "furnitureFit" || issue.category === "accessibility") return "#ef4444";
    return "#10b981";
  };

  return (
    <group userData={{ testId: "plan-quality-hints" }}>
      {hintedIssues.map((issue) => {
        const roomId = issue.target?.roomId ?? issue.roomId;
        const room = roomId ? roomById.get(roomId) : null;
        if (!room) return null;

        const color = colorForIssue(issue);
        return (
          <group key={issue.id} position={[room.x, 0.082, room.z]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[room.w, room.d]} />
              <meshBasicMaterial
                color={color}
                transparent
                opacity={issue.severity === "review" ? 0.12 : 0.09}
                depthWrite={false}
              />
            </mesh>
            <Line
              points={[
                [-room.w / 2, 0.01, -room.d / 2],
                [room.w / 2, 0.01, -room.d / 2],
                [room.w / 2, 0.01, room.d / 2],
                [-room.w / 2, 0.01, room.d / 2],
                [-room.w / 2, 0.01, -room.d / 2],
              ]}
              color={color}
              lineWidth={2}
            />
          </group>
        );
      })}
    </group>
  );
}
