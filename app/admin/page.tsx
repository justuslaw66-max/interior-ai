import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canAccessAdmin } from "@/lib/admin";
import OperationsDashboard from "./OperationsDashboard";
import { loadOperationsDashboardData } from "./operations-data";

export const metadata: Metadata = {
  title: "Catalog Operations · Interior AI",
  description: "Internal catalog, asset-processing, review, and commerce operations dashboard.",
};

export default async function AdminOperationsPage() {
  const session = await auth();
  if (!canAccessAdmin(session?.user?.email)) {
    redirect("/");
  }

  const data = await loadOperationsDashboardData();

  return <OperationsDashboard data={data} userEmail={session?.user?.email ?? null} />;
}
