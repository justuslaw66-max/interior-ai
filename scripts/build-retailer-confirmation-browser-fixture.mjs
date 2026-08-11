import { existsSync } from "node:fs";
import path from "node:path";
import webpack from "webpack";

const root = process.cwd();
const outputPath = path.join(
  root,
  ".next",
  "cache",
  "retailer-confirmation-browser-fixture"
);
const outputFile = path.join(outputPath, "bundle.js");

const compiler = webpack({
  mode: "production",
  target: "web",
  devtool: false,
  cache: false,
  entry: path.join(
    root,
    "tests",
    "required",
    "fixtures",
    "retailer-confirmation-harness.tsx"
  ),
  output: { path: outputPath, filename: "bundle.js", clean: true },
  resolve: {
    extensions: [".tsx", ".ts", ".jsx", ".js", ".mjs"],
    alias: { "@": root },
  },
  module: {
    rules: [{
      test: /\.[jt]sx?$/,
      exclude: /node_modules/,
      use: path.join(root, "scripts", "guest-save-overlay-ts-loader.mjs"),
    }],
  },
  plugins: [
    new webpack.DefinePlugin({
      "process.env": JSON.stringify({
        NODE_ENV: "production",
        NEXT_PUBLIC_ENABLE_QA_HOOKS: "1",
        NEXT_PUBLIC_POSTHOG_KEY: "",
      }),
    }),
  ],
  optimization: { minimize: false },
  performance: { hints: false },
});

const stats = await new Promise((resolve, reject) => {
  compiler.run((error, result) => {
    compiler.close(() => undefined);
    if (error) reject(error);
    else resolve(result);
  });
});
const details = stats.toJson({ all: false, errors: true, warnings: true });
if (details.errors?.length) {
  throw new Error(details.errors.map((error) => error.message).join("\n"));
}
if (!existsSync(outputFile)) {
  throw new Error("Retailer confirmation browser fixture bundle is missing");
}

console.log("Retailer confirmation browser fixture bundle prepared.");
