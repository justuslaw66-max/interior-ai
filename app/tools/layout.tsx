import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import "./tools-tailwind.css";

/**
 * Internal asset tools are admin-only. Their APIs already refuse other users;
 * the pages must not load for them either (UX audit AD8).
 */
export default async function ToolsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) notFound();
  return <>{children}</>;
}
