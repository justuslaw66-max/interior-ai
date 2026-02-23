import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Ensure Turbopack uses the project folder as the workspace root.
  // Use an absolute path so Turbopack doesn't complain.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
