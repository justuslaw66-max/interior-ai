"use client";

export function RoomSkeleton() {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]}>
        <planeGeometry args={[10, 10]} />
        <meshStandardMaterial color="#e8decc" roughness={0.86} metalness={0} />
      </mesh>

      <mesh position={[0, 0.35, -1]}>
        <boxGeometry args={[2.2, 0.7, 0.9]} />
        <meshStandardMaterial color="#c8c2b8" roughness={0.85} metalness={0.02} />
      </mesh>

      <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, -0.5]}>
        <planeGeometry args={[2.0, 1.6]} />
        <meshStandardMaterial color="#f2eee6" roughness={0.92} metalness={0} />
      </mesh>
    </group>
  );
}
