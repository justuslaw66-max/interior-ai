import { prisma } from "@/lib/prisma";
import { validateDeploymentEnvironmentOrThrow } from "@/lib/config";
import { assessFloorPlanServingIntegrity } from "@/lib/floor-plan-imports/serving-integrity";

function requestedLimit() {
  const argument = process.argv.find((value) => value.startsWith("--limit="));
  if (!argument) return 500;
  const value = Number(argument.slice("--limit=".length));
  return Number.isFinite(value) ? Math.min(5_000, Math.max(1, Math.floor(value))) : 500;
}

async function main() {
  validateDeploymentEnvironmentOrThrow();
  const rows = await prisma.floorPlanRevision.findMany({
    where: { publicationStatus: "published" },
    orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
    take: requestedLimit(),
    select: {
      id: true,
      geometryHash: true,
      verificationTier: true,
      publicationStatus: true,
      publishedAt: true,
      approvedAt: true,
      approvedByEmail: true,
      publishedByEmail: true,
      documentJson: true,
      sourceManifestJson: true,
      constructionEvidenceJson: true,
      publicMetadata: true,
      sourceJob: {
        select: {
          renderedPagesJson: true,
          sourceAsset: {
            select: {
              id: true,
              sha256: true,
              mimeType: true,
              contentDeletedAt: true,
            },
          },
          supplementarySources: {
            select: {
              attachedToCandidateAt: true,
              renderedPagesJson: true,
              sourceAsset: {
                select: {
                  id: true,
                  fileName: true,
                  mimeType: true,
                  sha256: true,
                  contentDeletedAt: true,
                },
              },
            },
          },
          constructionSources: {
            select: {
              evidenceKind: true,
              authorizedAt: true,
              authorizedByEmail: true,
              attachedToCandidateAt: true,
              sourceAsset: {
                select: {
                  id: true,
                  fileName: true,
                  mimeType: true,
                  sha256: true,
                  contentDeletedAt: true,
                },
              },
            },
          },
        },
      },
      addressBindings: {
        select: {
          id: true,
          countryCode: true,
          addressNormalized: true,
          block: true,
          street: true,
          postalCode: true,
          stack: true,
          floorMin: true,
          floorMax: true,
          transform: true,
          sourceEvidenceJson: true,
        },
      },
    },
  });
  const results = rows.map((row) => assessFloorPlanServingIntegrity(row));
  const invalid = results.filter((result) => !result.valid);
  console.log(
    JSON.stringify({
      event: "floor_plan_serving_integrity_audit",
      scanned: results.length,
      valid: results.length - invalid.length,
      invalid: invalid.length,
      failures: invalid,
    })
  );
  if (invalid.length > 0) process.exitCode = 1;
}

void main()
  .catch((cause) => {
    console.error("Floor-plan serving integrity audit failed", cause);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
