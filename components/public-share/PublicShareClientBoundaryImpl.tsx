"use client";

import type { ReactNode } from "react";
import type { DesignSnapshot } from "@/lib/room-types";
import { PublicShareShell } from "@/components/public-share/PublicShareShell";

export default function PublicShareClientBoundaryImpl({
  children,
  snapshot,
  projectionContentIdentity,
  projectionDiagnosticFingerprint,
}: {
  children: ReactNode;
  snapshot: DesignSnapshot;
  projectionContentIdentity: string;
  projectionDiagnosticFingerprint: string;
}) {
  return (
    <PublicShareShell
      snapshot={snapshot}
      projectionContentIdentity={projectionContentIdentity}
      projectionDiagnosticFingerprint={projectionDiagnosticFingerprint}
    >
      {children}
    </PublicShareShell>
  );
}
