import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getPostHogClient } from "@/lib/posthog-server";
import { config } from "@/lib/config";
import { parseDesignCreatePayload } from "@/lib/design-route-payload";

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
    const parsed = parseDesignCreatePayload(body);
    const rawPayload = body && typeof body === "object" ? (body as Record<string, unknown>) : {};

    if (config.logLevel === "debug") {
      console.log("Received design payload:", {
        titleType: typeof rawPayload.title,
        roomWidth: rawPayload.roomWidth,
        roomDepth: rawPayload.roomDepth,
        itemsLength: Array.isArray(rawPayload.items) ? rawPayload.items.length : null,
        hasSnapshot: Boolean(rawPayload.snapshot),
      });
    }

    if (!parsed.ok) {
      if (config.logLevel === "debug") {
        console.log("Validation failed:", {
          roomWidthType: typeof rawPayload.roomWidth,
          roomDepthType: typeof rawPayload.roomDepth,
          itemsIsArray: Array.isArray(rawPayload.items),
        });
      }
      return NextResponse.json(
        { error: parsed.error },
        { status: parsed.status }
      );
    }
    const payload = parsed.value;

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

    if (config.logLevel === "debug") {
      console.log("Creating design with:", {
        finalTitle: payload.title,
        finalRoomWidth: payload.roomWidth,
        finalRoomDepth: payload.roomDepth,
      });
    }

    const design = await prisma.design.create({
      data: {
        title: payload.title,
        roomWidth: payload.roomWidth,
        roomDepth: payload.roomDepth,
        items: payload.items as Prisma.InputJsonValue,
        ...(payload.snapshot
          ? { snapshot: payload.snapshot as unknown as Prisma.InputJsonValue }
          : {}),
        zones: payload.zones as Prisma.InputJsonValue,
        savedViews: payload.savedViews as Prisma.InputJsonValue,
        user: { connect: { id: session.user.id } },
        style: payload.style,
        budget: payload.budget,
        mode: payload.mode,
        notes: payload.notes,
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
        items_count: Array.isArray(rawPayload.items) ? rawPayload.items.length : 0,
        style: payload.style,
        budget: payload.budget,
        mode: payload.mode,
        room_width: payload.roomWidth,
        room_depth: payload.roomDepth,
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
