import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { FloorPlanDocumentV2 } from "../../lib/floor-plan-document-v2";
import type { ConsumerFloorPlanImportJob } from "../../components/editor/floor-plan-import-ui-types";
import { issueNavigationDocument, issueNavigationPages, issueNavigationIssues } from "../../scripts/fixtures/scan-to-editable-plan/issue-navigation";
import FloorPlanImportReviewPanel from "../../components/editor/floor-plan-import-review/FloorPlanImportReviewPanel";

const key = "scan-plan:issue-navigation-fixture";
const job: ConsumerFloorPlanImportJob = { id: "authored-issues", status: "needs_review", progress: 80, adapterId: "pdf-raster-hybrid",
  extractionVersion: "authored", statusChangedAt: null, lastAttemptAt: null, nextAttemptAt: null, leaseExpiresAt: null, heartbeatAt: null,
  renderedPagesJson: issueNavigationPages, candidateJson: null, reviewIssuesJson: issueNavigationIssues, candidateVersion: 1,
  errorMessage: null, appliedDesignId: null, sourceRetentionExpiresAt: "2026-10-15T00:00:00Z", sourceDeletionRequestedAt: null,
  trainingBenchmarkOptIn: false, sourceAsset: { contentDeletedAt: null } };

function Harness() {
  const [candidate, setCandidate] = useState<FloorPlanDocumentV2 | null>(() => JSON.parse(localStorage.getItem(key) ?? JSON.stringify(issueNavigationDocument())));
  const [issues, setIssues] = useState(issueNavigationIssues);
  useEffect(() => { if (candidate) localStorage.setItem(key, JSON.stringify(candidate)); }, [candidate]);
  return <main style={{ width: 1000, margin: "0 auto" }}>
    <h1>Issue navigation component verification</h1><p>Authored two-page source; production review components and local persistence.</p>
    {candidate && <FloorPlanImportReviewPanel candidate={candidate} job={job} issues={issues} setCandidate={setCandidate} setIssues={setIssues}
      entranceOpeningId="door" setEntranceOpeningId={() => undefined} cannotFinishReason={null} onSubmit={() => undefined} submitting={false} />}
    <output data-testid="fixture-document">{JSON.stringify(candidate)}</output>
  </main>;
}
const host = document.createElement("div"); document.body.append(host); createRoot(host).render(<Harness />);
