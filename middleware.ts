import { NextRequest, NextResponse } from "next/server";

function applyCors(req: NextRequest, res: NextResponse) {
  const origin = req.headers.get("origin");
  if (!origin) return res;

  res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set("Vary", "Origin");
  res.headers.set("Access-Control-Allow-Credentials", "true");
  res.headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With, Accept"
  );
  return res;
}

export function middleware(req: NextRequest) {
  // Keep CORS relaxation strictly in local dev.
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.next();
  }

  if (req.method === "OPTIONS") {
    return applyCors(req, new NextResponse(null, { status: 204 }));
  }

  return applyCors(req, NextResponse.next());
}

export const config = {
  matcher: ["/api/:path*", "/ingest/:path*", "/__nextjs_original-stack-frames"],
};
