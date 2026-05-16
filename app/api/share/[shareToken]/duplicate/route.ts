import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logAppEvent } from "@/lib/app-events";
import { buildDuplicatedDesignData } from "@/lib/design-duplication";
import { getPostHogClient } from "@/lib/posthog-server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ shareToken: string }> }
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { shareToken } = await params;
  const source = await prisma.design.findFirst({
    where: { shareToken, shareEnabled: true },
  });

  if (!source) {
    return NextResponse.json({ error: "Share link not found" }, { status: 404 });
  }

  const copy = await prisma.design.create({
    data: buildDuplicatedDesignData(
      {
        title: source.title,
        roomWidth: source.roomWidth,
        roomDepth: source.roomDepth,
        items: source.items,
        zones: source.zones,
        savedViews: source.savedViews,
        style: source.style,
        budget: source.budget,
        mode: source.mode,
        notes: source.notes,
      },
      userId
    ),
    select: { id: true },
  });

  await logAppEvent({
    eventType: "share_design_duplicated",
    userId,
    designId: copy.id,
    shareToken,
    meta: {
      sourceDesignId: source.id,
      sourceOwnerId: source.userId,
    },
  });

  const posthog = getPostHogClient();
  posthog.capture({
    distinctId: userId,
    event: "share_design_duplicated",
    properties: {
      source_design_id: source.id,
      source_share_token: shareToken,
      new_design_id: copy.id,
      style: source.style ?? null,
      budget: source.budget ?? null,
    },
  });

  return NextResponse.json({ id: copy.id });
}
