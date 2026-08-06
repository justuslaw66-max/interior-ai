import type { CSSProperties, ReactNode } from "react";

const safeAreaStyle: CSSProperties = {
  paddingTop: "env(safe-area-inset-top)",
  paddingLeft: "env(safe-area-inset-left)",
  paddingRight: "env(safe-area-inset-right)",
  paddingBottom: "env(safe-area-inset-bottom)",
};

export function PublicShareResolvedRoot({
  children,
  projectionContentIdentity,
  projectionDiagnosticFingerprint,
  selectedRoomId,
}: {
  children: ReactNode;
  projectionContentIdentity: string;
  projectionDiagnosticFingerprint: string;
  selectedRoomId: string | null;
}) {
  return (
    <main
      className="min-h-screen overflow-x-clip bg-neutral-100"
      data-testid="public-share-root"
      data-layout-status="resolving"
      data-layout-mode="resolving"
      data-layout-generation="0"
      data-selected-room-id={selectedRoomId ?? ""}
      data-selected-saved-view-id=""
      data-projection-content-identity={projectionContentIdentity}
      data-projection-fingerprint={projectionDiagnosticFingerprint}
      data-surface-width="0"
      data-surface-height="0"
      aria-busy="true"
      style={safeAreaStyle}
    >
      {children}
    </main>
  );
}

export function PublicShareLoadingState() {
  return (
    <main
      className="flex min-h-screen items-center justify-center bg-neutral-100 p-8"
      data-testid="public-share-loading"
      data-layout-status="loading"
      aria-busy="true"
    >
      <div className="rounded-xl border bg-white p-6 text-sm text-neutral-600" role="status">
        Loading shared design…
      </div>
    </main>
  );
}

export function PublicShareInvalidView() {
  return (
    <main
      className="flex min-h-screen items-center justify-center p-8"
      data-testid="public-share-invalid"
      data-layout-status="invalid"
    >
      <div className="rounded-xl border bg-white p-6" role="status">
        <div className="text-lg font-semibold">Link not available</div>
        <div className="text-sm text-neutral-600">This share link is disabled or invalid.</div>
      </div>
    </main>
  );
}
