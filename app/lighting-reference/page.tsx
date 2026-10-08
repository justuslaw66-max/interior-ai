import { notFound } from "next/navigation";
import { isAdminEmail } from "@/lib/admin";
import { auth } from "@/lib/auth";
import { LightingReferenceClient } from "./LightingReferenceClient";

export const metadata = {
  title: "Lighting reference · Interior AI",
  robots: { index: false, follow: false },
};

/** An internal rendering reference: admins only, like /tools (UX audit AD8). */
export default async function LightingReferencePage() {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) notFound();
  return <LightingReferenceClient />;
}
