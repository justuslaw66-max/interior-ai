import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateReferralCode } from "@/lib/referralCode";
import { getPostHogClient } from "@/lib/posthog-server";

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
    const raw = await req.text();
    body = raw ? (JSON.parse(raw) as { invitedByCode?: unknown }) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const invitedByCode =
    typeof body?.invitedByCode === "string" ? body.invitedByCode : null;

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

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { invitedByCode },
    select: { invitedByCode: true },
  });

  // Server-side PostHog tracking for referral code claimed (growth/viral event)
  const posthog = getPostHogClient();
  posthog.capture({
    distinctId: session.user.id,
    event: "referral_code_claimed",
    properties: {
      invited_by_code: invitedByCode,
      user_referral_code: referralCode,
    },
  });

  return NextResponse.json({
    referralCode,
    invitedByCode: updated.invitedByCode ?? null,
    applied: true,
  });
}
