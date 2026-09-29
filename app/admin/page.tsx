import type { Metadata } from "next";
import { canAccessAdmin } from "@/lib/admin";
import { buildStagingSmokeEvidenceBundle } from "@/lib/beta-staging-evidence";
import { getApplicationEnvironment } from "@/lib/config";
import StagingSmokeEvidencePanel from "@/components/admin/StagingSmokeEvidencePanel";
import OperationsDashboard from "./OperationsDashboard";
import { adminTitle } from "./admin-navigation";
import { auth } from "./admin-session";
import { loadOperationsDashboardData } from "./operations-data";

export const metadata: Metadata = {
  title: adminTitle("Overview"),
  description: "Internal catalog, asset-processing, review, and commerce operations dashboard.",
};

export default async function AdminOperationsPage() {
  const session = await auth();
  if (!canAccessAdmin(session?.user?.email)) return null;

  const data = await loadOperationsDashboardData();
  // The smoke worksheet is for sign-off on development and staging (staging builds run with
  // NODE_ENV=production, so the deployment's own environment decides), never production.
  const applicationEnvironment = getApplicationEnvironment();
  const showSmokeWorksheet = applicationEnvironment === "development" || applicationEnvironment === "staging";

  return (
    <>
      <OperationsDashboard data={data} />
      {showSmokeWorksheet ? <StagingSmokeEvidencePanel bundle={buildStagingSmokeEvidenceBundle({})} /> : null}
    </>
  );
}
