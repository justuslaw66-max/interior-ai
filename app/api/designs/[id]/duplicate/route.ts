import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { trackServerEvent } from "@/lib/server-analytics";
import { recordServerAnalyticsEvent } from "@/lib/app-events";
import { buildDuplicatedDesignData } from "@/lib/design-duplication";
import { rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rl = rateLimit(`design-duplicate:${userId}`, 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many duplicate requests" }, { status: 429 });

  const { id } = await params;
  const design = await prisma.design.findFirst({
    where: { id, userId },
  });

  if (!design) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true } });
  if (user?.plan !== "pro" && await prisma.design.count({ where: { userId } }) >= 20) {
    return NextResponse.json(
      { error: "Free beta limit reached (max 20 designs). Upgrade to create more." },
      { status: 403 }
    );
  }

  const copy = await prisma.design.create({
    data: buildDuplicatedDesignData(
      {
        title: design.title,
        roomWidth: design.roomWidth,
        roomDepth: design.roomDepth,
        items: design.items,
        snapshot: design.snapshot,
        zones: design.zones,
        savedViews: design.savedViews,
        style: design.style,
        budget: design.budget,
        mode: design.mode,
        notes: design.notes,
      },
      userId
    ),
    select: { id: true },
  });

  await recordServerAnalyticsEvent({
    eventType: "design_duplicated",
    userId,
    designId: copy.id,
    meta: {
      source: "owned_design",
      originalDesignId: id,
    },
  });

  trackServerEvent("design_duplicated", userId, {
    original_design_id: id,
    new_design_id: copy.id,
    style: design.style ?? null,
    budget: design.budget ?? null,
  });

  return NextResponse.json({ id: copy.id });
}
