import { NextResponse } from "next/server";
import { buildImportedModelsPayload } from "@/lib/catalog/imported-models-payload";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await buildImportedModelsPayload(), {
    headers: { "Cache-Control": "no-store" },
  });
}
