import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPostHogClient } from "@/lib/posthog-server";
import { config } from "@/lib/config";
import { rateLimit } from "@/lib/rateLimit";
import {
  buildDeterministicLayoutPlan,
  type AiLayoutCatalogEntry,
} from "@/lib/ai/layout-planner";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!config.features.aiEnabled) {
    return NextResponse.json({ error: "AI is disabled" }, { status: 503 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = rateLimit(`ai-layout:${session.user.id}`, 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many AI requests" }, { status: 429 });
  }

  const body = await req.json();
  const { roomWidth, roomDepth, roomType, style, budget, seed, catalog, requestedRoles } = body ?? {};

  if (
    typeof roomWidth !== "number" ||
    typeof roomDepth !== "number" ||
    !Array.isArray(catalog)
  ) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
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
    catalog: catalog as AiLayoutCatalogEntry[],
    requestedRoles,
  });

  if ("error" in plan) {
    return NextResponse.json(plan, { status: 422 });
  }

  // Server-side PostHog tracking
  const posthog = getPostHogClient();
  posthog.capture({
    distinctId: session.user.id,
    event: "ai_layout_generated",
    properties: {
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
    },
  });

  return NextResponse.json(plan);
}
