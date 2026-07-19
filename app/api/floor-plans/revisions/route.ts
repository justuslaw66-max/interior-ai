import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { error: "Use floor-plan search to discover published revisions" },
    { status: 400 }
  );
}
