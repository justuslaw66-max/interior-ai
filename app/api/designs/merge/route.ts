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
  const { anonymousId } = body ?? {};
  if (!anonymousId) {
    return NextResponse.json({ error: "Missing anonymousId" }, { status: 400 });
  }

  const result = await prisma.design.updateMany({
    where: {
      anonymousId,
      userId: undefined,
    },
    data: {
      userId,
      anonymousId: null,
    },
  });

  return NextResponse.json({ merged: result.count });
}
