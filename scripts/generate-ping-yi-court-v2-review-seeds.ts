import fs from "node:fs";
import path from "node:path";
import {
  generatePingYiCourtV2ReviewSeedBundle,
  serializePingYiCourtV2ReviewSeedBundle,
  type PingYiCourtSourceManifestV2,
} from "@/lib/floor-plan-seeds/ping-yi-court-v2";
import { getAllFloorPlanLibraryCatalogs } from "@/lib/floor-plan-library-yaml";

const PLAN_ID = "sg-hdb-ping-yi-court";
const SOURCE_DIRECTORY = path.join(
  process.cwd(),
  "catalog",
  "floor-plans",
  "sg",
  "hdb",
  "ping-yi-court"
);

function readManifest(): PingYiCourtSourceManifestV2 {
  return JSON.parse(
    fs.readFileSync(path.join(SOURCE_DIRECTORY, "source-manifest.json"), "utf8")
  ) as PingYiCourtSourceManifestV2;
}

function requestedOutputPath(): string | null {
  const outputIndex = process.argv.indexOf("--output");
  if (outputIndex === -1) return null;
  const value = process.argv[outputIndex + 1];
  if (!value) throw new Error("--output requires a destination path");
  return path.resolve(process.cwd(), value);
}

const catalog = getAllFloorPlanLibraryCatalogs().find(
  (candidate) => candidate.floor_plan.plan_id === PLAN_ID
);
if (!catalog) throw new Error(`Missing ${PLAN_ID} compatibility catalog`);

const bundle = generatePingYiCourtV2ReviewSeedBundle(catalog, readManifest());
const serialized = serializePingYiCourtV2ReviewSeedBundle(bundle);
const outputPath = requestedOutputPath();

if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, serialized, "utf8");
  console.log(`Wrote ${bundle.fixtures.length} native V2 review seeds to ${outputPath}.`);
} else {
  console.log(
    JSON.stringify(
      {
        planId: bundle.planId,
        verificationTier: bundle.verificationTier,
        publication: bundle.publication,
        fixtures: bundle.fixtures.map((fixture) => ({
          layoutId: fixture.layoutId,
          revisionId: fixture.document.revisionId,
          geometryHash: fixture.geometryHash,
          criticalIssueCount: fixture.document.verification.criticalIssueIds.length,
        })),
      },
      null,
      2
    )
  );
}
