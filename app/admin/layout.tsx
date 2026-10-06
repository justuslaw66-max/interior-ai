import "./admin-tailwind.css";
import type { ReactNode } from "react";
import { canAccessAdmin } from "@/lib/admin";
import { AdminAccessDenied } from "./AdminAccessDenied";
import { AdminShell } from "./AdminShell";
import { auth } from "./admin-session";

/**
 * Admin's frame (UX phase 4i). The layout checks access once for every page and shows the access
 * page to anyone else, instead of a silent redirect to the editor. Each page still checks before
 * its own work (pages render alongside their layout), and renders nothing for anyone else.
 */
export default async function AdminLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const session = await auth();
  const email = session?.user?.email ?? null;
  if (!canAccessAdmin(email)) return <AdminAccessDenied signedIn={Boolean(session?.user)} />;
  return <AdminShell userEmail={email}>{children}</AdminShell>;
}
