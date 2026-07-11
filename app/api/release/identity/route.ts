import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function exactCommit(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed && /^[0-9a-f]{40}$/i.test(trimmed) ? trimmed.toLowerCase() : null;
}

export async function GET() {
  return NextResponse.json(
    {
      buildCommit: exactCommit(process.env.VERCEL_GIT_COMMIT_SHA),
      environment:
        process.env.APP_ENV?.trim() ||
        process.env.NEXT_PUBLIC_APP_ENV?.trim() ||
        null,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
