import type { ReactNode } from "react";
import { PublicShareRouteLifecycle } from "@/components/public-share/PublicShareRootLifecycle";

export default function PublicShareLayout({ children }: { children: ReactNode }) {
  return <PublicShareRouteLifecycle>{children}</PublicShareRouteLifecycle>;
}
