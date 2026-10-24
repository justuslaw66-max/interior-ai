import { NextResponse } from "next/server";
import { canAccessAdmin } from "@/lib/admin";
import { auth } from "@/lib/auth";
import { readCondoMapFile } from "@/lib/condo-map/condo-map-files";
import { condoMapFilePath } from "@/lib/condo-map/condo-map-paths";

export const runtime = "nodejs";

/**
 * The admin condo map's data: a development's map, its units' plan pictures and its 3D models (catalog/condo-map), for
 * admins only. Mapbox fetches the models from here too, with the admin's session cookie (same origin).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const session = await auth();
  if (!canAccessAdmin(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const file = condoMapFilePath((await params).path);
  const bytes = file ? await readCondoMapFile(file) : null;
  if (!file || !bytes) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  }
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);
  return new NextResponse(body, {
    headers: {
      "Cache-Control": "private, max-age=300",
      "Content-Length": String(bytes.byteLength),
      "Content-Type": file.contentType,
      "Cross-Origin-Resource-Policy": "same-origin",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
