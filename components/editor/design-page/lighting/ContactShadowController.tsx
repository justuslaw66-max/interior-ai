"use client";

import { ContactShadows } from "@react-three/drei/core/ContactShadows";

import type { ResolvedEditorLighting } from "./lightingTypes";

export function ContactShadowController({
  lighting,
  center,
  width,
  depth,
  roomHeight,
}: {
  lighting: ResolvedEditorLighting;
  center: [number, number];
  width: number;
  depth: number;
  roomHeight: number;
}) {
  if (!lighting.effects.contactShadows) return null;

  const scale = Math.max(width, depth) + 2;

  return (
    <ContactShadows
      name="editor-contact-shadows"
      position={[center[0], 0.012, center[1]]}
      scale={scale}
      opacity={lighting.id === "presentation" ? 0.14 : 0.09}
      blur={2.8}
      far={Math.max(3, roomHeight + 1)}
      resolution={lighting.quality === "high" ? 512 : 256}
      frames={1}
      color="#33413d"
    />
  );
}
