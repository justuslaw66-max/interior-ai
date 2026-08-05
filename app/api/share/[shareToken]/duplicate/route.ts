import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logAppEvent } from "@/lib/app-events";
import { buildDuplicatedDesignData } from "@/lib/design-duplication";
import { trackServerEvent } from "@/lib/server-analytics";
import { prisma } from "@/lib/prisma";
import { projectSharedDesignTransport } from "@/lib/shared-design-snapshot";
import { rateLimit } from "@/lib/rateLimit";

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
  const rl = rateLimit(`share-duplicate:${userId}`, 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many duplicate requests" }, { status: 429 });

  const { shareToken } = await params;
  if (shareToken.length < 20 || shareToken.length > 128) {
    return NextResponse.json({ error: "Share link not found" }, { status: 404 });
  }
  const source = await prisma.design.findFirst({
    where: { shareToken, shareEnabled: true },
  });

  if (!source) {
    return NextResponse.json({ error: "Share link not found" }, { status: 404 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true } });
  if (user?.plan !== "pro" && await prisma.design.count({ where: { userId } }) >= 20) {
    return NextResponse.json(
      { error: "Free beta limit reached (max 20 designs). Upgrade to create more." },
      { status: 403 }
    );
  }

  const projectedSource = projectSharedDesignTransport(source);

  const copy = await prisma.design.create({
    data: buildDuplicatedDesignData(projectedSource, userId),
    select: { id: true },
  });

  await logAppEvent({
    eventType: "share_design_duplicated",
    userId,
    designId: copy.id,
    shareToken,
    meta: {
      sourceDesignId: source.id,
    },
  });

  trackServerEvent("share_design_duplicated", userId, {
    source_design_id: source.id,
    shared_context: true,
    new_design_id: copy.id,
    style: source.style ?? null,
    budget: source.budget ?? null,
  });

  return NextResponse.json({ id: copy.id });
}
