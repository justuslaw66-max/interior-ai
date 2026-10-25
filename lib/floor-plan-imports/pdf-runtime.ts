import path from "node:path";
import { pathToFileURL } from "node:url";

export async function loadFloorPlanPdfRuntime() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Load Node's API at runtime so the bundler cannot rewrite createRequire.
  const { default: nodeModule } = await import("node:module");
  const pdfRuntimeRequire = nodeModule.createRequire(`${process.cwd()}/package.json`);
  // Bundling relocates PDF.js; its native worker import needs the installed file.
  const workerPath = pdfRuntimeRequire.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
  // PDF.js decodes fax (CCITT), JBIG2 and JPEG 2000 pictures with its own decoders in pdfjs-dist/wasm, read from this
  // folder (a file path ending in a separator: in Node PDF.js reads them with fs). Without it such a picture is left
  // off the rendered page, as brochures scanned to black and white draw their plans (1 Suites, 10 Shelford, 120 Grange).
  const wasmUrl = path.join(path.dirname(workerPath), "..", "..", "wasm") + path.sep;
  return {
    createLoadingTask: (bytes: Uint8Array) => pdfjs.getDocument({
      data: bytes.slice(),
      useSystemFonts: true,
      wasmUrl,
    }),
    OPS: pdfjs.OPS,
  };
}
