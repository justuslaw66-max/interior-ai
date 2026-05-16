import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getPostHogClient } from "@/lib/posthog-server";
import { config } from "@/lib/config";

export const runtime = "nodejs";

export async function GET(_req: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const designs = await prisma.design.findMany({
      where: { userId: session.user.id },
      select: {
        id: true,
        title: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(designs, { status: 200 });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("API error:", errorMsg, err);
    return NextResponse.json(
      { error: `Server error: ${errorMsg}` },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    if (config.logLevel === "debug") {
      console.log("Received body:", body);
    }

    const { title, roomWidth, roomDepth, items, zones, savedViews, style, budget, mode, notes } = body ?? {};

    if (config.logLevel === "debug") {
      console.log("Extracted:", { title, roomWidth, roomDepth, itemsLength: items?.length });
    }

    if (
      typeof roomWidth !== "number" ||
      typeof roomDepth !== "number" ||
      !Array.isArray(items)
    ) {
      if (config.logLevel === "debug") {
        console.log("Validation failed:", {
          roomWidthType: typeof roomWidth,
          roomDepthType: typeof roomDepth,
          itemsIsArray: Array.isArray(items),
        });
      }
      return NextResponse.json(
        { error: "Invalid payload: roomWidth and roomDepth must be numbers, items must be array" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { plan: true },
    });
    const isProUser = user?.plan === "pro";

    if (!isProUser) {
      const count = await prisma.design.count({
        where: { userId: session.user.id },
      });
      if (count >= 20) {
        return NextResponse.json(
          {
            error:
              "Free beta limit reached (max 20 designs). Upgrade to create more.",
          },
          { status: 403 }
        );
      }
    }

    // Ensure items is properly serialized
    const itemsForStorage = JSON.parse(JSON.stringify(items));
    const safeZones = Array.isArray(zones)
      ? JSON.parse(JSON.stringify(zones))
      : [];
    const safeSavedViews = Array.isArray(savedViews)
      ? JSON.parse(JSON.stringify(savedViews))
      : [];
    const finalTitle = typeof title === "string" ? title : "Untitled Living Room";
    const finalRoomWidth = Number(roomWidth);
    const finalRoomDepth = Number(roomDepth);

    if (config.logLevel === "debug") {
      console.log("Creating design with:", { finalTitle, finalRoomWidth, finalRoomDepth });
    }

    const design = await prisma.design.create({
      data: {
        title: finalTitle,
        roomWidth: finalRoomWidth,
        roomDepth: finalRoomDepth,
        items: itemsForStorage,
        zones: safeZones,
        savedViews: safeSavedViews,
        user: { connect: { id: session.user.id } },
        style: typeof style === "string" ? style : null,
        budget: typeof budget === "string" ? budget : null,
        mode: typeof mode === "string" ? mode : "homeowner",
        notes: typeof notes === "string" ? notes : null,
      },
    });

    if (config.logLevel === "debug") {
      console.log("Design created successfully:", design.id);
    }

    // Server-side PostHog tracking for design creation (conversion event)
    const posthog = getPostHogClient();
    posthog.capture({
      distinctId: session.user.id,
      event: "design_created",
      properties: {
        design_id: design.id,
        items_count: items.length,
        style: style ?? null,
        budget: budget ?? null,
        mode: mode ?? "homeowner",
        room_width: finalRoomWidth,
        room_depth: finalRoomDepth,
        is_pro: isProUser,
      },
    });

    return NextResponse.json({ id: design.id }, { status: 201 });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("API error:", errorMsg, err);
    return NextResponse.json(
      { error: `Server error: ${errorMsg}` },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await prisma.design.deleteMany({
      where: { userId: session.user.id },
    });

    return NextResponse.json({ deleted: result.count }, { status: 200 });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("API error:", errorMsg, err);
    return NextResponse.json(
      { error: `Server error: ${errorMsg}` },
      { status: 500 }
    );
  }
}
