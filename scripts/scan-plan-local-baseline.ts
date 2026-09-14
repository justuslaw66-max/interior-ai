import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { PdfRasterFloorPlanSourceAdapter } from "@/lib/floor-plan-imports/pdf-raster-adapter";
import { floorPlanImportPrivacyForUpload } from "@/lib/floor-plan-imports/privacy";
import type { FloorPlanSourceStore, StoredFloorPlanDerivative } from "@/lib/floor-plan-imports/source-adapter";

async function main() {
  if (process.env.FLOOR_PLAN_VISION_DISABLED !== "1") throw new Error("Run with FLOOR_PLAN_VISION_DISABLED=1; this benchmark never authorizes external inference.");
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error("Usage: scan-plan-local-baseline.ts <private input> <private output directory>");
  await fs.mkdir(output, { recursive: true, mode: 0o700 });
  const bytes = await fs.readFile(input);
  const mimeType = input.toLowerCase().endsWith(".pdf") ? "application/pdf" : input.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
  const hash = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
  const source = { id: "private-benchmark-source", fileName: `source${path.extname(input)}`, mimeType, bytes, byteLength: bytes.length, sha256: hash(bytes) };
  const derivatives = new Map<string, StoredFloorPlanDerivative>();
  const store: FloorPlanSourceStore = {
    putSource: async () => source, readSource: async () => source,
    putDerivative: async (value) => {
      const id = `derivative-${derivatives.size}`;
      derivatives.set(id, { ...value, id, byteLength: value.bytes.length, sha256: hash(value.bytes) });
      await fs.writeFile(path.join(output, `${id}-${value.fileName}`), value.bytes, { mode: 0o600 });
      return id;
    },
    readDerivative: async (id) => derivatives.get(id) ?? null,
  };
  const adapter = new PdfRasterFloorPlanSourceAdapter();
  const context = { jobId: "private-baseline", store, privacy: floorPlanImportPrivacyForUpload({ trainingBenchmarkOptIn: false }) };
  const timings: Record<string, number> = {};
  let started = performance.now();
  const pages = await adapter.render(source, context);
  timings.renderMs = performance.now() - started;
  started = performance.now();
  let result = await adapter.extract(source, pages, context);
  timings.extractMs = performance.now() - started;
  await fs.writeFile(path.join(output, "extraction.json"), JSON.stringify(result, null, 2), { mode: 0o600 });
  for (const stage of ["solveScale", "buildTopology", "validate"] as const) {
    started = performance.now();
    result = await adapter[stage](result, context);
    timings[`${stage}Ms`] = performance.now() - started;
  }
  await fs.writeFile(path.join(output, "result.json"), JSON.stringify({ pages, timings, result }, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ timings, metrics: result.metrics, issues: result.reviewIssues.map(({ code, severity }) => ({ code, severity })), output }, null, 2));
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
