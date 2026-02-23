import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getPostHogClient } from "@/lib/posthog-server";

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

  const itemsForStorage = JSON.parse(JSON.stringify(design.items ?? []));
  const rawSavedViews = (design as any)?.savedViews;
  const savedViewsForStorage = Array.isArray(rawSavedViews)
    ? JSON.parse(JSON.stringify(rawSavedViews))
    : [];

  const copy = await prisma.design.create({
    data: {
      user: { connect: { id: userId } },
      title: `${design.title} (copy)`,
      roomWidth: design.roomWidth,
      roomDepth: design.roomDepth,
      items: itemsForStorage,
      ...(savedViewsForStorage.length
        ? ({ savedViews: savedViewsForStorage } as any)
        : {}),
      style: design.style,
      budget: design.budget,
      mode: design.mode ?? "homeowner",
      shareEnabled: false,
      shareToken: null,
    },
    select: { id: true },
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
