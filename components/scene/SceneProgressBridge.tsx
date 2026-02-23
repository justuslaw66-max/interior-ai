"use client";

import { useEffect } from "react";
import { useProgress } from "@react-three/drei";

export function SceneProgressBridge({
  onReadyChange,
}: {
  onReadyChange: (ready: boolean) => void;
}) {
  const { active, progress } = useProgress();

  useEffect(() => {
    const ready = !active || progress > 95;
    onReadyChange(ready);
  }, [active, progress, onReadyChange]);

  return null;
}
