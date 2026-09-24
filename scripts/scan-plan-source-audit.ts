import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import type { RegisteredPageEvidence } from "@/lib/floor-plan-imports/deterministic-evidence";

type VisualAudit = {
  sourceSha256: string; method: string; scope: string; tolerancePx: number; printedDimensionsMm: number[];
  calibrationChecks: Array<{ name: string; valueMm: number; startPx: [number, number]; endPx: [number, number] }>;
  limitations: string[];
};
const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);

async function main() {
  const [sourcePath, extractionPath, auditPath, outputPath] = process.argv.slice(2);
  if (!outputPath) throw new Error("Usage: scan-plan-source-audit.ts <source> <extraction.json> <independent-audit.json> <private-output>");
  const [source, extractionBytes, auditBytes] = await Promise.all([fs.readFile(sourcePath), fs.readFile(extractionPath, "utf8"), fs.readFile(auditPath, "utf8")]);
  const audit: VisualAudit = JSON.parse(auditBytes);
  if (createHash("sha256").update(source).digest("hex") !== audit.sourceSha256) throw new Error("Audit/source byte identity mismatch.");
  const extraction = JSON.parse(extractionBytes);
  if (extraction.candidate.source.sha256 !== audit.sourceSha256) throw new Error("Extraction/source byte identity mismatch.");
  const page: RegisteredPageEvidence = extraction.candidate.pages[0];
  const metadata = await sharp(source).metadata();
  const normalization = extraction.candidate.renderedPages?.[0]?.normalization;
  if ((metadata.orientation && metadata.orientation !== 1) || metadata.width !== page.widthPx || metadata.height !== page.heightPx ||
    (normalization?.sourceToRendered && JSON.stringify(normalization.sourceToRendered) !== "[1,0,0,1,0,0]")) {
    throw new Error("This original-pixel audit requires an identity source transform; annotate the normalized page separately.");
  }
  const observed = page.semantics.dimensionLabels.map((dimension) => dimension.valueMm);
  const remaining = [...observed];
  const missing = audit.printedDimensionsMm.filter((expected) => {
    const index = remaining.indexOf(expected);
    if (index < 0) return true;
    remaining.splice(index, 1); return false;
  });
  const spans = audit.calibrationChecks.map((check) => ({ ...check,
    lengthPx: Math.hypot(check.endPx[0] - check.startPx[0], check.endPx[1] - check.startPx[1]) }));
  const pixelsPerMm = spans.reduce((sum, span) => sum + span.valueMm * span.lengthPx, 0) /
    spans.reduce((sum, span) => sum + span.valueMm ** 2, 0);
  const checks = spans.map((span) => ({ ...span, impliedMmPerPx: span.valueMm / span.lengthPx,
    fittedLengthPx: span.valueMm * pixelsPerMm, residualPx: span.valueMm * pixelsPerMm - span.lengthPx }));
  const report = { sourceSha256: audit.sourceSha256, auditMethod: audit.method, auditScope: audit.scope,
    independentPlanCount: 1, printedNumberComparison: { expected: audit.printedDimensionsMm.length, observed: observed.length,
      matched: audit.printedDimensionsMm.length - missing.length, missing, unexpectedOrDuplicate: remaining },
    calibration: { tolerancePx: audit.tolerancePx, globalMmPerPx: 1 / pixelsPerMm, checks,
      agrees: checks.every((check) => Math.abs(check.residualPx) <= audit.tolerancePx), appliedToDocument: false },
    retainedEvidence: { strokes: page.vectorSegments.length, textCandidates: page.text.length },
    limitations: audit.limitations };
  await fs.mkdir(outputPath, { recursive: true, mode: 0o700 });
  await fs.writeFile(path.join(outputPath, "comparison.json"), JSON.stringify(report, null, 2), { mode: 0o600 });
  // Analytical overlay only; no geometry is generated from these display marks.
  const dataUri = `data:image/png;base64,${(await sharp(source).png().toBuffer()).toString("base64")}`;
  const lines = page.vectorSegments.map((line) => `<path d="M${line.start.x} ${line.start.y} L${line.end.x} ${line.end.y}"/>`).join("");
  const labels = page.text.map((text) => `<text x="${text.center.x}" y="${text.center.y}" transform="rotate(${text.rotationDegrees ?? 0} ${text.center.x} ${text.center.y})">${escape(text.text)}</text>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${page.widthPx}" height="${page.heightPx}"><image href="${dataUri}" width="100%" height="100%" opacity=".55"/><g fill="none" stroke="#059669" stroke-width="1.5">${lines}</g><g fill="#7c3aed" font-family="Arial" font-size="11">${labels}</g></svg>`;
  await fs.writeFile(path.join(outputPath, "retained-evidence.svg"), svg, { mode: 0o600 });
  await sharp(Buffer.from(svg)).png().toFile(path.join(outputPath, "retained-evidence.png"));
  console.log(JSON.stringify(report, null, 2));
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
