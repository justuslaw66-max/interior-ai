/**
 * Admin API - Models List
 * GET /api/admin/models
 * 
 * Returns list of ModelAssets with metadata
 */

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";

export async function GET(_request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email || !isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const models = await prisma.modelAsset.findMany({
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(models);
  } catch (error) {
    console.error("Error fetching models:", error);
    return NextResponse.json(
      { error: "Failed to fetch models" },
      { status: 500 }
    );
  }
}
