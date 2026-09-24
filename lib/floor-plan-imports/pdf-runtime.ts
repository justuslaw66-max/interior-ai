import { pathToFileURL } from "node:url";

export async function loadFloorPlanPdfRuntime() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Load Node's API at runtime so the bundler cannot rewrite createRequire.
  const { default: nodeModule } = await import("node:module");
  const pdfRuntimeRequire = nodeModule.createRequire(`${process.cwd()}/package.json`);
  // Bundling relocates PDF.js; its native worker import needs the installed file.
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
    pdfRuntimeRequire.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs")
  ).href;
  return {
    createLoadingTask: (bytes: Uint8Array) => pdfjs.getDocument({
      data: bytes.slice(),
      useSystemFonts: true,
    }),
    OPS: pdfjs.OPS,
  };
}
