import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";

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
    designs.slice(0, 10).map((d: any) => {
      const itemsForStorage = JSON.parse(JSON.stringify(d.items ?? []));
      return prisma.design.create({
        data: {
          user: { connect: { id: userId } },
          title: typeof d.title === "string" ? d.title : "Imported Design",
          roomWidth: Number(d.roomWidth) || 4.2,
          roomDepth: Number(d.roomDepth) || 4.2,
          items: itemsForStorage,
          style: typeof d.style === "string" ? d.style : null,
          budget: typeof d.budget === "string" ? d.budget : null,
          mode: typeof d.mode === "string" ? d.mode : "homeowner",
          shareEnabled: false,
          shareToken: null,
        },
      });
    })
  );

  return NextResponse.json({ ok: true, created: created.length });
}
