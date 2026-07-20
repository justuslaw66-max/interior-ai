import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: ["stripe", "@napi-rs/canvas"],
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
