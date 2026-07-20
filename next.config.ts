import type { NextConfig } from "next";

const postHogRegion = process.env.NEXT_PUBLIC_POSTHOG_HOST?.toLowerCase().includes("eu.")
  ? "eu"
  : "us";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: ["stripe", "@napi-rs/canvas"],
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: `https://${postHogRegion}-assets.i.posthog.com/static/:path*`,
      },
      {
        source: "/ingest/array/:path*",
        destination: `https://${postHogRegion}-assets.i.posthog.com/array/:path*`,
      },
      {
        source: "/ingest/:path*",
        destination: `https://${postHogRegion}.i.posthog.com/:path*`,
      },
    ];
  },
  outputFileTracingExcludes: {
    "/*": [
      "./hero.jpg",
      "./studio.jpg",
      "./incoming/**/*",
      "./reports/**/*",
      "./public/assets/catalog/**/*",
      "./public/assets/models/**/*",
      "./public/assets/thumbs/**/*",
      "./public/draco/**/*",
      "./public/materials/**/*",
      "./public/pbr/**/*",
      "./public/swatches/**/*",
    ],
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
