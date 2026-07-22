import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateReferralCode } from "@/lib/referralCode";
import { trackServerEvent } from "@/lib/server-analytics";
import { readJsonRequest } from "@/lib/api-boundary";

async function ensureReferralCode(userId: string) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateReferralCode();
    try {
      const updated = await prisma.user.update({
        where: { id: userId },
        data: { referralCode: code },
        select: { referralCode: true },
      });
      return updated.referralCode;
    } catch {
      // try again on unique conflict
    }
  }
  return null;
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { invitedByCode?: unknown } = {};
  try {
    const raw = await readJsonRequest(req, 2 * 1024);
    body = raw && typeof raw === "object" ? raw as { invitedByCode?: unknown } : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const invitedByCode =
    typeof body?.invitedByCode === "string" && /^[a-z0-9]{10}$/.test(body.invitedByCode)
      ? body.invitedByCode
      : null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, referralCode: true, invitedByCode: true },
  });

  if (!user) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const referralCode = user.referralCode ?? (await ensureReferralCode(user.id));

  if (!invitedByCode || user.invitedByCode) {
    return NextResponse.json({
      referralCode,
      invitedByCode: user.invitedByCode ?? null,
      applied: false,
    });
  }

  if (referralCode && invitedByCode === referralCode) {
    return NextResponse.json({
      referralCode,
      invitedByCode: user.invitedByCode ?? null,
      applied: false,
    });
  }

  const inviter = await prisma.user.findUnique({
    where: { referralCode: invitedByCode },
    select: { id: true },
  });
  if (!inviter) {
    return NextResponse.json({
      referralCode,
      invitedByCode: user.invitedByCode ?? null,
      applied: false,
    });
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { invitedByCode },
    select: { invitedByCode: true },
  });

  trackServerEvent("referral_code_claimed", session.user.id, {
    referral_applied: true,
  });

  return NextResponse.json({
    referralCode,
    invitedByCode: updated.invitedByCode ?? null,
    applied: true,
  });
}
