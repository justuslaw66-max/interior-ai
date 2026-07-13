import { NextResponse } from "next/server";
import { getFreshCatalogYamlMap } from "@/lib/catalog-yaml";
import { getPublishedFlooringMaterials, getSurfaceMaterials } from "@/lib/catalog-registry";
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
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ||
    process.env.GIT_COMMIT_SHA?.slice(0, 12) ||
    process.env.npm_package_version ||
    "development"
  );
}

async function checkDatabase() {
  const timeout = new Promise<never>((_resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Database health check timed out")), DATABASE_TIMEOUT_MS);
    timer.unref?.();
  });

  await Promise.race([prisma.$queryRaw`SELECT 1`, timeout]);
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

    if (deep) {
      try {
        await checkDatabase();
        database = "ok";
      } catch (error) {
        database = "error";
        void captureHealthError(error, "database");
      }
    }

    const healthy = catalogOk && database !== "error";
    return NextResponse.json(
      {
        service: "interior-ai",
        status: healthy ? "ok" : "degraded",
        timestamp: new Date().toISOString(),
        build: buildIdentity(),
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
