import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import webpack from "webpack";

const root = process.cwd();
const outputPath = path.join(
  root,
  ".next",
  "cache",
  "floor-plan-upload-browser-fixture"
);
const outputFiles = ["bundle.js", "empty-entry.js"].map((file) =>
  path.join(outputPath, file)
);
const outputRelativePath = ".next/cache/floor-plan-upload-browser-fixture";
const producerSourcePaths = [
  "scripts/build-floor-plan-upload-browser-fixture.mjs",
  "scripts/guest-save-overlay-ts-loader.mjs",
  "tests/required/fixtures/floor-plan-empty-entry-harness.tsx",
  "tests/required/fixtures/floor-plan-upload-dialog-harness.tsx",
  "tests/required/fixtures/next-navigation-browser-fixture.ts",
];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const canonicalJsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);

const compiler = webpack({
  mode: "production",
  target: "web",
  devtool: false,
  cache: false,
  entry: {
    bundle: path.join(
      root,
      "tests",
      "required",
      "fixtures",
      "floor-plan-upload-dialog-harness.tsx"
    ),
    "empty-entry": path.join(
      root,
      "tests",
      "required",
      "fixtures",
      "floor-plan-empty-entry-harness.tsx"
    ),
  },
  output: {
    path: outputPath,
    filename: "[name].js",
    chunkFilename: "[name].chunk.js",
    publicPath: "",
    clean: true,
  },
  resolve: {
    extensions: [".tsx", ".ts", ".jsx", ".js", ".mjs"],
    alias: {
      "@": root,
      "next/navigation$": path.join(
        root,
        "tests",
        "required",
        "fixtures",
        "next-navigation-browser-fixture.ts"
      ),
    },
  },
  module: {
    rules: [
      {
        test: /\.[jt]sx?$/,
        exclude: /node_modules/,
        use: path.join(root, "scripts", "guest-save-overlay-ts-loader.mjs"),
      },
    ],
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
if (outputFiles.some((file) => !existsSync(file))) {
  throw new Error("Floor Plan Upload browser fixture bundle is missing");
}
const files = readdirSync(outputPath)
  .sort()
  .map((name) => {
    const filePath = path.join(outputPath, name);
    const metadata = lstatSync(filePath);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error(`Floor Plan Upload browser fixture contains a non-file: ${name}`);
    }
    const bytes = readFileSync(filePath);
    return { path: name, size: bytes.byteLength, sha256: sha256(bytes) };
  });
const closedInventory = files.map((file) => ({
  path: `${outputRelativePath}/${file.path}`,
  type: "file",
  size: file.size,
  sha256: file.sha256,
}));
const manifest = {
  schema: "interior-ai.floor-plan-upload-browser-fixture-manifest.v1",
  outputPath: outputRelativePath,
  files,
  producerSources: producerSourcePaths.map((relativePath) => ({
    path: relativePath,
    sha256: sha256(readFileSync(path.join(root, relativePath))),
  })),
  inventorySha256: sha256(
    Buffer.concat([
      Buffer.from(
        "interior-ai.production-certification-source-generated-output-inventory-seal.v1\n"
      ),
      canonicalJsonBytes(closedInventory),
    ])
  ),
};
console.log(`INTERIOR_AI_FLOOR_PLAN_FIXTURE_MANIFEST ${JSON.stringify(manifest)}`);
console.log("Floor Plan Upload browser fixture bundle prepared.");
