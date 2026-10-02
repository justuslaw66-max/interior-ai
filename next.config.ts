import type { NextConfig } from "next";

const postHogRegion = process.env.NEXT_PUBLIC_POSTHOG_HOST?.toLowerCase().includes("eu.")
  ? "eu"
  : "us";

// sharp's Linux binary loads libvips from its sibling @img package at run time; file tracing
// does not follow that link, so Vercel functions failed with "libvips-cpp.so … cannot open".
const SHARP_LINUX_NATIVE_FILES = [
  "./node_modules/@img/sharp-linux-x64/**/*",
  "./node_modules/@img/sharp-libvips-linux-x64/**/*",
];

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
  // Retain the dynamically loaded sibling worker for each server PDF importer.
  outputFileTracingIncludes: {
    "/api/floor-plan-imports/*/process": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
    "/api/admin/floor-plan-imports/*/construction-sources": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
    "/api/admin/floor-plan-imports/*/supplementary-sources": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
    // Every route family that reaches lib/floor-plan-imports, which imports sharp.
    "/api/floor-plan-imports": SHARP_LINUX_NATIVE_FILES,
    "/api/floor-plan-imports/**": SHARP_LINUX_NATIVE_FILES,
    "/api/admin/floor-plan-imports": SHARP_LINUX_NATIVE_FILES,
    "/api/admin/floor-plan-imports/**": SHARP_LINUX_NATIVE_FILES,
    "/api/admin/floor-plan-variant-groups": SHARP_LINUX_NATIVE_FILES,
    "/api/admin/floor-plan-variant-groups/**": SHARP_LINUX_NATIVE_FILES,
    "/api/designs": SHARP_LINUX_NATIVE_FILES,
    "/api/designs/**": SHARP_LINUX_NATIVE_FILES,
    "/api/floor-plans/**": SHARP_LINUX_NATIVE_FILES,
  },
  outputFileTracingExcludes: {
    "/*": [
      "./hero.jpg",
      "./studio.jpg",
      "./.env*",
      "./.git/**/*",
      "./.local/**/*",
      "./.vercel/**/*",
      "./incoming/**/*",
      "./release-evidence-private/**/*",
      "./reports/**/*",
      "./services/**/*",
      "./test-results*/**/*",
      "./public/assets/catalog/**/*",
      "./public/assets/models/**/*",
      "./public/assets/thumbs/**/*",
      "./public/draco/**/*",
      "./public/materials/**/*",
      "./public/pbr/**/*",
      "./public/swatches/**/*",
    ],
    "/api/tools/glb-optimizer": ["./scripts/test-*"],
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
