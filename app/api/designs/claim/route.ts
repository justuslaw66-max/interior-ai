import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseDesignClaimPayload } from "@/lib/design-route-payload";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = parseDesignClaimPayload(body);

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }
  const { anonymousId, roomType, itemsCount, design: payload } = parsed.value;

  const design = await prisma.design.create({
    data: {
      anonymousId,
      title: payload.title,
      roomWidth: payload.roomWidth,
      roomDepth: payload.roomDepth,
      items: payload.items as Prisma.InputJsonValue,
      ...(payload.snapshot
        ? { snapshot: payload.snapshot as unknown as Prisma.InputJsonValue }
        : {}),
      zones: payload.zones as Prisma.InputJsonValue,
      savedViews: payload.savedViews as Prisma.InputJsonValue,
      style: payload.style,
      budget: payload.budget,
      mode: payload.mode,
      notes: payload.notes,
      shareEnabled: false,
      shareToken: null,
    },
    select: { id: true },
  });

  return NextResponse.json({ designId: design.id, roomType, itemsCount });
}
