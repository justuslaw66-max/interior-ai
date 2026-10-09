"use client";

import { useMemo, type ReactNode } from "react";

/**
 * A scene item's group, tagged with its item and layer. The user data stays
 * the same object across renders, so re-rendering the items layer doesn't make
 * R3F re-apply it and redraw.
 */
export function SceneItemGroup({ name, visible, sceneItemId, sceneLayerId, children }: {
  name: string;
  visible: boolean;
  sceneItemId: string;
  sceneLayerId: string;
  children: ReactNode;
}) {
  const userData = useMemo(() => ({ sceneItemId, sceneLayerId }), [sceneItemId, sceneLayerId]);
  return <group name={name} visible={visible} userData={userData}>{children}</group>;
}
