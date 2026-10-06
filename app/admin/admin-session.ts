import { cache } from "react";
import { auth as readSession } from "@/lib/auth";

/**
 * The session, read once per admin request: the layout checks access with it and each page checks
 * again before its own work (UX phase 4i), without a second database lookup.
 */
export const auth = cache(() => readSession());
