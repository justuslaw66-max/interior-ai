import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPostHogClient } from "@/lib/posthog-server";
import { config } from "@/lib/config";
import { rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

function seededRand(seedNum: number) {
  const x = Math.sin(seedNum) * 10000;
  return x - Math.floor(x);
}

function pickSeeded<T>(arr: T[], seedNum: number, offset: number) {
  if (!arr.length) return null;
  const r = seededRand(seedNum + offset);
  const idx = Math.floor(r * arr.length);
  return arr[idx];
}

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
  const { roomWidth, roomDepth, style, budget, seed, catalog } = body ?? {};

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

  const matchesStyle = catalog.filter(
    (p: any) =>
      Array.isArray(p.styleTags) &&
      p.styleTags.some((t: string) => String(t).toLowerCase() === styleNorm)
  );

  const pool = matchesStyle.length ? matchesStyle : catalog;

  const pickByCategory = (cat: string, offset: number) => {
    const styleItems = pool
      .filter((p: any) => p.category === cat)
      .sort((a: any, b: any) => (a.price ?? 0) - (b.price ?? 0));

    const allItems = catalog
      .filter((p: any) => p.category === cat)
      .sort((a: any, b: any) => (a.price ?? 0) - (b.price ?? 0));

    const items = styleItems.length >= 2 ? styleItems : allItems;

    if (!items.length) return null;

    if (budgetNorm === "$") return items[0];
    if (budgetNorm === "$$$") return items[items.length - 1];

    return pickSeeded(items, seedNum, offset);
  };

  const plan = {
    picks: {
      sofa: pickByCategory("sofa", 11)?.id,
      rug: pickByCategory("rug", 22)?.id,
      coffee_table: pickByCategory("coffee_table", 33)?.id,
      tv_console: pickByCategory("tv_console", 44)?.id ?? null,
      accent_chair: pickByCategory("accent_chair", 55)?.id ?? null,
      floor_lamp: pickByCategory("floor_lamp", 66)?.id ?? null,
    },
    intent: {
      sofa: "back_wall_center",
      rug: "under_sofa",
      coffee_table: "in_front_of_sofa",
      tv_console: "front_wall_center",
    },
    meta: { style: styleNorm, budget: budgetNorm, seed: seedNum },
  };

  // Server-side PostHog tracking
  const posthog = getPostHogClient();
  posthog.capture({
    distinctId: session.user.id,
    event: "ai_layout_generated",
    properties: {
      style: styleNorm,
      budget: budgetNorm,
      seed: seedNum,
      room_width: roomWidth,
      room_depth: roomDepth,
      items_count: Object.values(plan.picks).filter(Boolean).length,
    },
  });

  return NextResponse.json(plan);
}
