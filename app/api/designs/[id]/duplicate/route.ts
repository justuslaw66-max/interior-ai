import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getPostHogClient } from "@/lib/posthog-server";
import { logAppEvent } from "@/lib/app-events";
import { buildDuplicatedDesignData } from "@/lib/design-duplication";

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

  const { id } = await params;
  const design = await prisma.design.findFirst({
    where: { id, userId },
  });

  if (!design) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const copy = await prisma.design.create({
    data: buildDuplicatedDesignData(
      {
        title: design.title,
        roomWidth: design.roomWidth,
        roomDepth: design.roomDepth,
        items: design.items,
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

  await logAppEvent({
    eventType: "design_duplicated",
    userId,
    designId: copy.id,
    meta: {
      source: "owned_design",
      originalDesignId: id,
    },
  });

  // Server-side PostHog tracking for design duplication (engagement metric)
  const posthog = getPostHogClient();
  posthog.capture({
    distinctId: userId,
    event: "design_duplicated",
    properties: {
      original_design_id: id,
      new_design_id: copy.id,
      style: design.style ?? null,
      budget: design.budget ?? null,
    },
  });

  return NextResponse.json({ id: copy.id });
}
