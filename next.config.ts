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
const PDFJS_RUNTIME_FILES = [
  "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
  "./node_modules/pdfjs-dist/wasm/**/*",
  // The standard fonts, as outlines, for a PDF's own drawing of a font it does not embed (pdf-own-drawing.ts).
  "./node_modules/pdfjs-dist/standard_fonts/**/*",
];

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  // tesseract.js starts its OCR worker from a script inside its own package, so routes load it from node_modules,
  // where that script is, rather than from a bundle.
  serverExternalPackages: ["stripe", "@napi-rs/canvas", "tesseract.js"],
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
  // Retain the dynamically loaded sibling worker for each server PDF importer, and the picture decoders it reads at
  // run time (fax, JBIG2 and JPEG 2000 pictures: lib/floor-plan-imports/pdf-runtime.ts).
  outputFileTracingIncludes: {
    "/api/floor-plan-imports/*/process": PDFJS_RUNTIME_FILES,
    "/api/admin/floor-plan-imports/*/construction-sources": PDFJS_RUNTIME_FILES,
    "/api/admin/floor-plan-imports/*/supplementary-sources": PDFJS_RUNTIME_FILES,
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
    // The Download PDF's furnished plan sets its labels in the vector exporter's font, read from public/ at run time.
    "/api/export/pdf": ["./public/fonts/liberation-sans/LiberationSans-Regular.ttf"],
    // The admin condo map reads its developments from catalog/condo-map at run time (lib/condo-map/condo-map-files).
    "/api/admin/condo-map/**": ["./catalog/condo-map/**/*"],
    "/admin/condo-map": ["./catalog/condo-map/index.json"],
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
