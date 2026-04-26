import type { NextConfig } from "next";
import path from "path";

function resolvePostHogIngestHost(rawHost?: string): string {
  const fallback = "https://us.i.posthog.com";
  const host = (rawHost ?? fallback).trim();

  if (!host) return fallback;

  const normalized = host.replace(/\/$/, "").toLowerCase();

  if (
    normalized === "https://app.posthog.com" ||
    normalized === "https://us.posthog.com" ||
    normalized === "app.posthog.com" ||
    normalized === "us.posthog.com"
  ) {
    return fallback;
  }

  if (normalized === "https://eu.posthog.com" || normalized === "eu.posthog.com") {
    return "https://eu.i.posthog.com";
  }

  return host.replace(/\/$/, "");
}

const posthogIngestHost = resolvePostHogIngestHost(process.env.NEXT_PUBLIC_POSTHOG_HOST);

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: `${posthogIngestHost}/static/:path*`,
      },
      {
        source: "/ingest/:path*",
        destination: `${posthogIngestHost}/:path*`,
      },
    ];
  },
};

export default nextConfig;
