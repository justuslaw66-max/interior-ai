"use client";

import dynamic from "next/dynamic";

const PublicShareClientBoundaryImpl = dynamic(
  () => import("@/components/public-share/PublicShareClientBoundaryImpl"),
  {
    ssr: false,
    loading: () => null,
  }
);

export { PublicShareClientBoundaryImpl as PublicShareClientBoundary };
