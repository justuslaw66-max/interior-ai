import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { trackServerEvent } from "@/lib/server-analytics";
import { config } from "@/lib/config";
import { rateLimit } from "@/lib/rateLimit";
import {
  ApiBoundaryError,
  apiErrorResponse,
  apiSuccessHeaders,
  createOperationId,
  readJsonRequest,
} from "@/lib/api-boundary";
import { logOperationalEvent } from "@/lib/observability";
import {
  buildDeterministicLayoutPlan,
  type AiLayoutCatalogEntry,
  type AiLayoutFloorPlanQualityContext,
} from "@/lib/ai/layout-planner";

export const runtime = "nodejs";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeCatalog(value: unknown): AiLayoutCatalogEntry[] | null {
  if (!Array.isArray(value) || value.length > 1_000) return null;
  const entries: AiLayoutCatalogEntry[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) return null;
    const id = typeof raw.id === "string" && raw.id.length <= 128 ? raw.id : undefined;
    const category = typeof raw.category === "string" && raw.category.length <= 80
      ? raw.category
      : undefined;
    if (!id || !category) return null;
    const entry: AiLayoutCatalogEntry = { id, category };
    if (raw.price !== undefined) {
      if (typeof raw.price !== "number" || !Number.isFinite(raw.price) || raw.price < 0) return null;
      entry.price = raw.price;
    }
    if (raw.styleTags !== undefined) {
      if (
        !Array.isArray(raw.styleTags) ||
        raw.styleTags.length > 30 ||
        raw.styleTags.some((tag) => typeof tag !== "string" || tag.length > 80)
      ) return null;
      entry.styleTags = raw.styleTags as string[];
    }
    if (raw.dimensions !== undefined) {
      if (!isRecord(raw.dimensions)) return null;
      const dimensions: NonNullable<AiLayoutCatalogEntry["dimensions"]> = {};
      for (const key of ["w", "d", "h"] as const) {
        const dimension = raw.dimensions[key];
        if (dimension !== undefined) {
          if (typeof dimension !== "number" || !Number.isFinite(dimension) || dimension <= 0 || dimension > 100) {
            return null;
          }
          dimensions[key] = dimension;
        }
      }
      entry.dimensions = dimensions;
    }
    entries.push(entry);
  }
  return entries;
}

export async function POST(req: Request) {
  const operation = "ai.layout";
  const operationId = createOperationId();
  const startedAt = Date.now();
  try {
  if (!config.features.aiEnabled) {
    throw new ApiBoundaryError(503, "INTERNAL_ERROR", "AI layout is unavailable.");
  }

  const session = await auth();
  if (!session?.user?.id) {
    throw new ApiBoundaryError(401, "UNAUTHORIZED", "Sign in to continue.");
  }

  const rl = rateLimit(`ai-layout:${session.user.id}`, 20, 60_000);
  if (!rl.ok) {
    throw new ApiBoundaryError(429, "RATE_LIMITED", "Too many AI requests.");
  }

  const body = await readJsonRequest(req, 1024 * 1024);
  const payload = isRecord(body) ? body : {};
  const {
    roomWidth,
    roomDepth,
    roomType,
    style,
    budget,
    seed,
    catalog,
    requestedRoles,
    floorPlanQualityContext,
  } = payload;

  const normalizedCatalog = normalizeCatalog(catalog);

  if (
    typeof roomWidth !== "number" || !Number.isFinite(roomWidth) || roomWidth < 0.5 || roomWidth > 100 ||
    typeof roomDepth !== "number" || !Number.isFinite(roomDepth) || roomDepth < 0.5 || roomDepth > 100 ||
    !normalizedCatalog ||
    (typeof style === "string" && style.length > 80) ||
    (typeof budget === "string" && budget.length > 40) ||
    (typeof roomType === "string" && roomType.length > 40) ||
    (seed !== undefined && (typeof seed !== "number" || !Number.isFinite(seed))) ||
    (requestedRoles !== undefined && (!Array.isArray(requestedRoles) || requestedRoles.length > 10)) ||
    (floorPlanQualityContext !== undefined &&
      floorPlanQualityContext !== null &&
      !isRecord(floorPlanQualityContext))
  ) {
    throw new ApiBoundaryError(400, "BAD_REQUEST", "Invalid AI layout request.");
  }

  const styleNorm = String(style ?? "Modern").toLowerCase();
  const budgetNorm = String(budget ?? "$$");
  const seedNum = typeof seed === "number" ? seed : Date.now();

  const plan = buildDeterministicLayoutPlan({
    roomWidth,
    roomDepth,
    roomType,
    style,
    budget,
    seed: seedNum,
    catalog: normalizedCatalog,
    requestedRoles,
    floorPlanQualityContext: isRecord(floorPlanQualityContext)
      ? (floorPlanQualityContext as AiLayoutFloorPlanQualityContext)
      : null,
  });

  if ("error" in plan) {
    return NextResponse.json(plan, { status: 422 });
  }

  trackServerEvent("ai_layout_generated", session.user.id, {
    style: styleNorm,
    budget: budgetNorm,
    seed: seedNum,
    room_type: plan.meta.roomType,
    room_width: roomWidth,
    room_depth: roomDepth,
    quality_completeness: plan.quality.completeness,
    quality_fit_risk: plan.quality.fitRisk,
    quality_required_missing: plan.quality.requiredMissing,
    requested_roles: plan.meta.requestedRoles,
    items_count: Object.values(plan.picks).filter(Boolean).length,
  });

  logOperationalEvent({
    operation,
    operationId,
    outcome: "succeeded",
    durationMs: Date.now() - startedAt,
    status: 200,
    meta: { itemCount: normalizedCatalog.length, fitRisk: plan.quality.fitRisk },
  });
  return NextResponse.json(plan, { headers: apiSuccessHeaders(operationId) });
  } catch (error) {
    return apiErrorResponse(error, { operation, operationId, startedAt });
  }
}
