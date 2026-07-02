import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";

type ImportedDesign = {
  title?: string;
  roomWidth?: number;
  roomDepth?: number;
  items?: unknown[];
  style?: string;
  budget?: string;
  mode?: string;
};

export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const designs = Array.isArray(body?.designs) ? body.designs : [];

  if (designs.length === 0) {
    return NextResponse.json({ ok: true, created: 0 });
  }

  const created = await prisma.$transaction(
    designs.slice(0, 10).map((designInput: ImportedDesign) => {
      const itemsForStorage = JSON.parse(JSON.stringify(designInput.items ?? []));
      return prisma.design.create({
        data: {
          user: { connect: { id: userId } },
          title: typeof designInput.title === "string" ? designInput.title : "Imported Design",
          roomWidth: Number(designInput.roomWidth) || 4.2,
          roomDepth: Number(designInput.roomDepth) || 4.2,
          items: itemsForStorage,
          style: typeof designInput.style === "string" ? designInput.style : null,
          budget: typeof designInput.budget === "string" ? designInput.budget : null,
          mode: typeof designInput.mode === "string" ? designInput.mode : "homeowner",
          shareEnabled: false,
          shareToken: null,
        },
      });
    })
  );

  return NextResponse.json({ ok: true, created: created.length });
}
