import { NextResponse } from "next/server";
import { canAccessAdmin } from "@/lib/admin";
import { auth } from "@/lib/auth";
import {
  RequestBodyTooLargeError,
  readBoundedRequestBody,
} from "@/lib/bounded-request-body";
import { PrismaFloorPlanImportJobRepository } from "@/lib/floor-plan-imports/prisma-repository";
import { PrismaFloorPlanSourceStore } from "@/lib/floor-plan-imports/prisma-store";
import { floorPlanImportPrivacyForUpload } from "@/lib/floor-plan-imports/privacy";
import { loadPingYiCourtV2ReviewSeedBundle } from "@/lib/floor-plan-seeds/ping-yi-court-review-intake";
import { downloadPingYiCourtReviewSource } from "@/lib/floor-plan-seeds/ping-yi-court-review-source";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_REQUEST_BYTES = 8 * 1024;

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId || !canAccessAdmin(session?.user?.email)) return error("Forbidden", 403);
  if (!rateLimit(`admin-floor-plan-review-seed:${userId}`, 8, 60_000).ok) {
    return error("Too many review jobs", 429);
  }

  let body: unknown;
  try {
    const bytes = await readBoundedRequestBody(request, MAX_REQUEST_BYTES);
    body = JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch (cause) {
    if (cause instanceof RequestBodyTooLargeError) return error("Request is too large", 413);
    return error("Invalid review-job request", 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return error("Invalid review-job request", 400);
  }
  const layoutId = typeof (body as { layoutId?: unknown }).layoutId === "string"
    ? (body as { layoutId: string }).layoutId.trim()
    : "";

  let bundle: ReturnType<typeof loadPingYiCourtV2ReviewSeedBundle>;
  try {
    bundle = loadPingYiCourtV2ReviewSeedBundle();
  } catch (cause) {
    console.error("Unable to load Ping Yi Court review seeds", cause);
    return error("Review seed configuration is unavailable", 500);
  }
  const fixture = bundle.fixtures.find((candidate) => candidate.layoutId === layoutId);
  if (!fixture) return error("Unknown Ping Yi Court review layout", 400);

  let sourceBytes: Uint8Array;
  try {
    sourceBytes = await downloadPingYiCourtReviewSource({ bundle });
  } catch (cause) {
    console.error("Unable to retrieve the registered Ping Yi Court source", cause);
    return error(
      cause instanceof Error ? cause.message : "Unable to retrieve the registered source PDF",
      502
    );
  }

  const store = new PrismaFloorPlanSourceStore();
  const preparedSource = await store.prepareSource({
    ownerScope: userId,
    fileName: "ping-yi-court-floor-plans.pdf",
    mimeType: "application/pdf",
    bytes: sourceBytes,
  });
  try {
    const result = await prisma.$transaction(async (transaction) => {
      const source = await preparedSource.persist(transaction);
      const repository = new PrismaFloorPlanImportJobRepository(transaction);
      const job = await repository.create({
        userId,
        sourceAssetId: source.id,
        privacy: floorPlanImportPrivacyForUpload({ trainingBenchmarkOptIn: false }),
      });
      return { source, job };
    });
    await preparedSource.finalize();
    return NextResponse.json(
      {
        job: {
          id: result.job.id,
          status: result.job.status,
          candidateVersion: 0,
          source: {
            fileName: result.source.fileName,
            mimeType: result.source.mimeType,
            sha256: result.source.sha256,
          },
        },
        fixture: {
          layoutId: fixture.layoutId,
          label: fixture.label,
          sourcePage: fixture.sourcePage,
        },
        next: {
          processUrl: `/api/floor-plan-imports/${result.job.id}/process`,
          reviewSeedUrl: `/api/admin/floor-plan-imports/${result.job.id}/review-seed`,
          reviewUrl: `/admin/floor-plans/${result.job.id}`,
        },
      },
      { status: 201, headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (cause) {
    await preparedSource.rollback(cause);
    console.error("Unable to create Ping Yi Court review job", cause);
    return error("Unable to create the review job", 500);
  }
}
