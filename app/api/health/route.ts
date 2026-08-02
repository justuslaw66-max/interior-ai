import { NextResponse } from "next/server";
import { FloorPlanImportJobStatus, Prisma } from "@prisma/client";
import { getFreshCatalogYamlMap } from "@/lib/catalog-yaml";
import { getPublishedFlooringMaterials, getSurfaceMaterials } from "@/lib/catalog-registry";
import { assessFloorPlanQueueHealth } from "@/lib/floor-plan-imports/queue-health";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const DATABASE_TIMEOUT_MS = 4_000;

async function captureHealthError(error: unknown, check: "application" | "database") {
  if (!process.env.SENTRY_DSN && !process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureException(error, { tags: { endpoint: "health", check } });
}

function buildIdentity() {
  return (
    process.env.PRODUCTION_ARTIFACT_BUILD_ID ||
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ||
    process.env.GIT_COMMIT_SHA?.slice(0, 12) ||
    process.env.npm_package_version ||
    "development"
  );
}

function productionArtifactIdentity() {
  if (process.env.PRODUCTION_ARTIFACT_EVIDENCE !== "1") return null;
  const nextBuildId = process.env.PRODUCTION_ARTIFACT_BUILD_ID;
  const artifactSha256 = process.env.PRODUCTION_ARTIFACT_SHA256;
  const sourceCommitSha = process.env.PRODUCTION_ARTIFACT_COMMIT_SHA;
  if (
    !nextBuildId ||
    !/^[0-9a-f]{64}$/i.test(artifactSha256 ?? "") ||
    !/^[0-9a-f]{40,64}$/i.test(sourceCommitSha ?? "")
  ) {
    throw new Error("Production artifact identity is incomplete or malformed");
  }
  return {
    kind: "local-production-mode-artifact",
    nextBuildId,
    artifactSha256,
    sourceCommitSha,
  };
}

async function checkDatabase() {
  const timeout = new Promise<never>((_resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Database health check timed out")), DATABASE_TIMEOUT_MS);
    timer.unref?.();
  });

  await Promise.race([prisma.$queryRaw`SELECT 1`, timeout]);
}

async function checkFloorPlanQueue() {
  const now = new Date();
  const processableStatuses: FloorPlanImportJobStatus[] = [
    FloorPlanImportJobStatus.received,
    FloorPlanImportJobStatus.rendered,
    FloorPlanImportJobStatus.extracted,
    FloorPlanImportJobStatus.scale_solved,
    FloorPlanImportJobStatus.topology_built,
    FloorPlanImportJobStatus.validating,
  ];
  const dueForProcessing: Prisma.FloorPlanImportJobWhereInput = {
    status: { in: processableStatuses },
    AND: [
      { OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
      { OR: [{ leaseToken: null }, { leaseExpiresAt: { lte: now } }] },
    ],
  };
  const failedSince = new Date(now.getTime() - 24 * 60 * 60 * 1_000);
  const [queued, oldestQueued, active, expiredLeases, failedLast24Hours] =
    await Promise.all([
      prisma.floorPlanImportJob.count({ where: dueForProcessing }),
      prisma.floorPlanImportJob.findFirst({
        where: dueForProcessing,
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      }),
      prisma.floorPlanImportJob.count({
        where: { leaseToken: { not: null }, leaseExpiresAt: { gt: now } },
      }),
      prisma.floorPlanImportJob.count({
        where: { leaseToken: { not: null }, leaseExpiresAt: { lte: now } },
      }),
      prisma.floorPlanImportJob.count({
        where: { status: "failed", updatedAt: { gte: failedSince } },
      }),
    ]);
  return assessFloorPlanQueueHealth({
    now,
    snapshot: {
      queued,
      active,
      expiredLeases,
      failedLast24Hours,
      oldestQueuedAt: oldestQueued?.createdAt ?? null,
    },
  });
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  const url = new URL(request.url);
  const deep = url.searchParams.get("deep") === "1";
  try {
    const yamlEntries = Array.from(getFreshCatalogYamlMap().values());
    const surfaceMaterials = getSurfaceMaterials({ includeDrafts: true });
    const publishedFlooring = getPublishedFlooringMaterials();
    const catalogOk = yamlEntries.length > 0 && surfaceMaterials.length > 0;
    let database: "not_checked" | "ok" | "error" = "not_checked";
    let floorPlanImports:
      | { status: "not_checked" }
      | Awaited<ReturnType<typeof checkFloorPlanQueue>> = { status: "not_checked" };

    if (deep) {
      try {
        await checkDatabase();
        database = "ok";
        floorPlanImports = await checkFloorPlanQueue();
      } catch (error) {
        database = "error";
        void captureHealthError(error, "database");
      }
    }

    const healthy =
      catalogOk &&
      database !== "error" &&
      floorPlanImports.status !== "error";
    const degraded =
      !healthy || floorPlanImports.status === "degraded";
    return NextResponse.json(
      {
        service: "interior-ai",
        status: degraded ? "degraded" : "ok",
        timestamp: new Date().toISOString(),
        build: buildIdentity(),
        productionArtifact: productionArtifactIdentity(),
        durationMs: Date.now() - startedAt,
        checks: {
          application: "ok",
          catalog: {
            status: catalogOk ? "ok" : "error",
            yamlEntries: yamlEntries.length,
            surfaceMaterials: surfaceMaterials.length,
            publishedFlooring: publishedFlooring.length,
          },
          database,
          floorPlanImports,
        },
      },
      {
        status: healthy ? 200 : 503,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    void captureHealthError(error, "application");
    return NextResponse.json(
      {
        service: "interior-ai",
        status: "error",
        timestamp: new Date().toISOString(),
        build: buildIdentity(),
        durationMs: Date.now() - startedAt,
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
