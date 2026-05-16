import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdminEmail } from "@/lib/admin";

export async function GET() {
  const session = await auth();
  const email = session?.user?.email ?? null;

  if (email && isAdminEmail(email)) {
    return NextResponse.json({ plan: "pro", source: "admin_allowlist" });
  }

  if (!session?.user?.id) {
    return NextResponse.json({ plan: "free", source: "anon" });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { plan: true },
  });

  return NextResponse.json({ plan: user?.plan ?? "free", source: "db" });
}
