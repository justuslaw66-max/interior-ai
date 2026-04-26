import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getPostHogClient } from "@/lib/posthog-server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();
    const design = await prisma.design.findUnique({
      where: { id },
    });

    if (!design) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const isOwner = session?.user?.id && design.userId === session.user.id;

    return NextResponse.json({
      id: design.id,
      title: design.title,
      roomWidth: design.roomWidth,
      roomDepth: design.roomDepth,
      items: design.items,
      zones: design.zones ?? [],
      savedViews: design.savedViews ?? [],
      style: design.style,
      budget: design.budget,
      mode: design.mode,
      notes: design.notes,
      updatedAt: design.updatedAt,
      shareToken: isOwner ? design.shareToken : null,
      shareEnabled: isOwner ? design.shareEnabled : false,
    });
  } catch (err) {
    console.error("GET error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const design = await prisma.design.findUnique({ where: { id } });
    if (!design) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (design.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { title, roomWidth, roomDepth, items, zones, savedViews, style, budget, mode, notes } = body ?? {};

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { plan: true },
    });
    const isProUser = user?.plan === "pro";
    const itemsArr = Array.isArray(items) ? items : [];
    if (!isProUser && itemsArr.length > 20) {
      return NextResponse.json(
        { error: "Free beta limit: max 20 items per design." },
        { status: 403 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (typeof title === "string") updateData.title = title;
    if (typeof roomWidth === "number") updateData.roomWidth = Number(roomWidth);
    if (typeof roomDepth === "number") updateData.roomDepth = Number(roomDepth);
    if (Array.isArray(items)) updateData.items = JSON.parse(JSON.stringify(items));
    if (Array.isArray(zones)) {
      updateData.zones = JSON.parse(JSON.stringify(zones));
    }
    if (Array.isArray(savedViews)) {
      updateData.savedViews = JSON.parse(JSON.stringify(savedViews));
    }
    if (typeof style === "string") updateData.style = style;
    if (typeof budget === "string") updateData.budget = budget;
    if (typeof mode === "string") updateData.mode = mode;
    if (typeof notes === "string") updateData.notes = notes;

    const updated = await prisma.design.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ id: updated.id, updatedAt: updated.updatedAt });
  } catch (err) {
    console.error("PUT error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const design = await prisma.design.findUnique({ where: { id } });
    if (!design) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (design.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.design.delete({ where: { id } });

    // Server-side PostHog tracking for design deletion (churn analysis)
    const posthog = getPostHogClient();
    posthog.capture({
      distinctId: session.user.id,
      event: "design_deleted",
      properties: {
        design_id: id,
        style: design.style ?? null,
        budget: design.budget ?? null,
        mode: design.mode ?? null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
