import { NextResponse } from "next/server";
import { isQaEnabled } from "@/lib/qa";
import { buildImportedModelsPayload } from "@/lib/catalog/imported-models-payload";

export const dynamic = "force-dynamic";

export async function GET() {
  const allowDebug = isQaEnabled();

  if (!allowDebug) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(await buildImportedModelsPayload(), {
    headers: { "Cache-Control": "no-store" },
  });
}
