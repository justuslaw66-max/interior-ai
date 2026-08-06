"use client";

import type { ReactNode } from "react";
import type { DesignSnapshot } from "@/lib/room-types";
import { PublicShareShell } from "@/components/public-share/PublicShareShell";
import { PublicShareResolvedRoot } from "@/components/public-share/PublicShareRootLifecycle";

export default function PublicShareClientBoundaryImpl({
  children,
  snapshot,
  projectionContentIdentity,
  projectionDiagnosticFingerprint,
  selectedRoomId,
}: {
  children: ReactNode;
  snapshot: DesignSnapshot;
  projectionContentIdentity: string;
  projectionDiagnosticFingerprint: string;
  selectedRoomId: string | null;
}) {
  return (
    <PublicShareResolvedRoot
      projectionContentIdentity={projectionContentIdentity}
      projectionDiagnosticFingerprint={projectionDiagnosticFingerprint}
      selectedRoomId={selectedRoomId}
    >
      <PublicShareShell
        snapshot={snapshot}
        projectionContentIdentity={projectionContentIdentity}
        projectionDiagnosticFingerprint={projectionDiagnosticFingerprint}
      >
        {children}
      </PublicShareShell>
    </PublicShareResolvedRoot>
  );
}
