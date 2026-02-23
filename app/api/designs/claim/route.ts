import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const {
    anonymousId,
    designSnapshot,
    roomType,
    itemsCount,
  } = body ?? {};

  if (!anonymousId || !designSnapshot) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const {
    title,
    roomWidth,
    roomDepth,
    items,
    style,
    budget,
    mode,
    notes,
  } = designSnapshot ?? {};

  if (
    typeof roomWidth !== "number" ||
    typeof roomDepth !== "number" ||
    !Array.isArray(items)
  ) {
    return NextResponse.json({ error: "Invalid snapshot" }, { status: 400 });
  }

  const design = await prisma.design.create({
    data: {
      anonymousId,
      title: typeof title === "string" ? title : "Guest Design",
      roomWidth: Number(roomWidth),
      roomDepth: Number(roomDepth),
      items: JSON.parse(JSON.stringify(items)),
      style: typeof style === "string" ? style : null,
      budget: typeof budget === "string" ? budget : null,
      mode: typeof mode === "string" ? mode : "homeowner",
      notes: typeof notes === "string" ? notes : null,
      shareEnabled: false,
      shareToken: null,
    } as any,
    select: { id: true },
  });

  return NextResponse.json({ designId: design.id, roomType, itemsCount });
}
