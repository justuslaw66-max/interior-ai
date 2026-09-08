// Pro matrix diagnostics only. Does not alter the required runner or runtime evidence.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { auditRetainedEvidenceDirectory, sanitizePortableEvidenceText } from "../../scripts/required-test-truthfulness.mjs";

const INPUT = ".local/required-test-evidence/ci.pro-visual-policy";
const OUTPUT = ".local/pro-visual-diagnostics-upload";
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const git = (root, ref) => execFileSync("git", ["rev-parse", ref], { cwd: root, encoding: "utf8" }).trim();

function files(root, directory = root) {
  if (lstatSync(directory).isSymbolicLink()) throw new Error("Diagnostic symlink rejected");
  return readdirSync(directory).flatMap(name => {
    const entry = path.join(directory, name);
    const stat = lstatSync(entry);
    if (stat.isSymbolicLink()) throw new Error("Diagnostic symlink rejected");
    if (stat.isDirectory()) return files(root, entry);
    if (!stat.isFile()) throw new Error("Diagnostic special file rejected");
    return [path.relative(root, entry).split(path.sep).join("/")];
  });
}

// Keep archive inspection bounded; Python's standard zipfile avoids a new dependency.
const ZIP = `import sys,zipfile,pathlib
mode,archive,directory=sys.argv[1:]
root=pathlib.Path(directory)
if mode=='unpack':
 with zipfile.ZipFile(archive) as z:
  entries=z.infolist()
  if len(entries)>10000 or sum(e.file_size for e in entries)>256*1024*1024: raise ValueError('Trace exceeds diagnostic inspection bound')
  for e in entries:
   p=pathlib.PurePosixPath(e.filename)
   if p.is_absolute() or '..' in p.parts or any(s.startswith('.') for s in p.parts) or '\\\\' in e.filename: raise ValueError('Unsafe trace member')
   if e.is_dir(): continue
   target=root.joinpath(*p.parts)
   target.parent.mkdir(parents=True,exist_ok=True)
   target.write_bytes(z.read(e))
else:
 with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
  for p in sorted(root.rglob('*')):
   if p.is_file(): z.write(p,p.relative_to(root).as_posix())
`;

function scrubTraceValue(value) {
  if (Array.isArray(value)) return value.map(scrubTraceValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => {
    if (/^(headers|cookies)$/i.test(key)) return [key, []];
    if (/(secret|password|private.?key|api.?key|access.?key|cookie|storageState|credential)/i.test(key)) return [key, "<REDACTED>"];
    return [key, scrubTraceValue(child)];
  }));
}

export async function prepareProVisualDiagnostics({ repositoryRoot = process.cwd(), environment = process.env } = {}) {
  const root = path.resolve(repositoryRoot);
  const input = path.join(root, INPUT);
  const output = path.join(root, OUTPUT);
  const sourceCommitSha = git(root, "HEAD"), sourceTreeSha = git(root, "HEAD^{tree}");
  const scratch = `${output}.inspection`;
  rmSync(output, { recursive: true, force: true });
  rmSync(scratch, { recursive: true, force: true });
  const included = [], omitted = [], missing = [];
  const textAudit = path.join(scratch, "text-audit");
  mkdirSync(textAudit, { recursive: true });
  const inspectText = (bytes, json = false) => {
    let text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (json) text = JSON.stringify(JSON.parse(text), null, 2) + "\n";
    text = sanitizePortableEvidenceText(text, root);
    // Synthetic fixture identities are allowed; unexpected email content is excluded.
    const identityText = text.replace(/\b(?:src|page)@[\w-]+\.(?:txt|jpeg|png)\b/g, "<TRACE-RESOURCE>");
    if (/[\w.+-]+@(?!example\.test\b)[\w.-]+\.[A-Za-z]{2,}/.test(identityText)) throw new Error("non-fixture-email");
    const auditPath = path.join(textAudit, json ? "payload.json" : "payload.txt");
    rmSync(textAudit, { recursive: true, force: true });
    mkdirSync(textAudit);
    writeFileSync(auditPath, text);
    auditRetainedEvidenceDirectory({ repositoryRoot: root, evidenceRoot: path.relative(root, textAudit), environment });
    return Buffer.from(text);
  };
  const imageBytes = async bytes => {
    const metadata = await sharp(bytes, { limitInputPixels: 40_000_000 }).metadata();
    if (!["png", "jpeg"].includes(metadata.format)) throw new Error("unsupported-image-content");
    // Decode and re-encode actual raster contents, dropping embedded metadata.
    return metadata.format === "png" ? sharp(bytes).png().toBuffer() : sharp(bytes).jpeg().toBuffer();
  };
  const retain = (relative, original, bytes) => {
    const destination = path.join(output, relative);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, bytes);
    included.push({ path: relative, originalSha256: sha256(original), retainedSha256: sha256(bytes) });
  };
  try {
    const available = existsSync(input) ? files(input) : [];
    let report;
    if (available.includes("playwright.json")) {
      try { report = JSON.parse(readFileSync(path.join(input, "playwright.json"), "utf8")); }
      catch { missing.push("playwright.json:malformed"); }
    }
    for (const expected of ["evidence.json", "playwright.json"]) if (!available.includes(expected)) missing.push(expected);
    for (const relative of available) {
      const original = readFileSync(path.join(input, relative));
      try {
        if (relative === "playwright-output/.last-run.json") throw new Error("redundant-run-state-existing-policy");
        if (!/^(?:evidence\.json|playwright\.json|playwright-output\/[a-zA-Z0-9_-]+\/(?:trace\.zip|test-failed-\d+\.png|error-context\.md|[a-zA-Z0-9_-]+\.png|pro-visual-observations\.json|attachments\/pro-visual-observations-[a-f0-9]+\.json))$/.test(relative)) throw new Error("outside-pro-diagnostic-allowlist");
        if (original.length > 128 * 1024 * 1024) throw new Error("file-exceeds-diagnostic-bound");
        if (relative === "evidence.json") {
          const evidence = JSON.parse(original);
          if (evidence.sourceCommitSha !== sourceCommitSha || evidence.sourceTreeSha !== sourceTreeSha) throw new Error("foreign-source-evidence");
          if (evidence.report?.sha256 && available.includes("playwright.json")
            && evidence.report.sha256 !== sha256(readFileSync(path.join(input, "playwright.json")))) throw new Error("report-digest-mismatch");
        }
        if (relative === "playwright.json") {
          const identity = report?.config?.metadata?.requiredTestEvidence;
          if (identity?.sourceCommitSha !== sourceCommitSha || identity?.sourceTreeSha !== sourceTreeSha) throw new Error("unbound-playwright-report");
        }
        if (relative.endsWith("trace.zip")) {
          const unpacked = path.join(scratch, "unpacked"), packed = path.join(scratch, "packed");
          rmSync(unpacked, { recursive: true, force: true }); rmSync(packed, { recursive: true, force: true });
          mkdirSync(packed);
          execFileSync("python3", ["-c", ZIP, "unpack", path.join(input, relative), unpacked], { stdio: "pipe" });
          for (const member of files(unpacked)) {
            const raw = readFileSync(path.join(unpacked, member));
            try {
              let bytes;
              if (/^(?:test|\d+-trace)\.(?:trace|network|stacks)$/.test(member)) {
                bytes = inspectText(Buffer.from(raw.toString("utf8").split("\n").filter(Boolean)
                  .map(line => JSON.stringify(scrubTraceValue(JSON.parse(line)))).join("\n") + "\n"));
              } else if (/^resources\/(?:page@[\w-]+|[a-f0-9]+)\.(?:png|jpeg)$/.test(member)) bytes = await imageBytes(raw);
              else if (/^resources\/[a-f0-9]{40}(?:\.(?:dat|json|txt|css|html))?$/.test(member)) {
                if (raw.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) || raw.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) bytes = await imageBytes(raw);
                else bytes = inspectText(raw);
              }
              else throw new Error("unneeded-source-or-uninspectable-trace-resource");
              const destination = path.join(packed, member);
              mkdirSync(path.dirname(destination), { recursive: true }); writeFileSync(destination, bytes);
            } catch { omitted.push({ path: `${relative}:${member}`, originalSha256: sha256(raw), reason: "trace-member-unsafe-or-outside-allowlist" }); }
          }
          if (!files(packed).some(member => member.endsWith(".trace"))) throw new Error("no-inspectable-trace-events");
          const archive = path.join(scratch, "trace.zip");
          execFileSync("python3", ["-c", ZIP, "pack", archive, packed], { stdio: "pipe" });
          retain(relative, original, readFileSync(archive));
        } else if (relative.endsWith(".png")) retain(relative, original, await imageBytes(original));
        else retain(relative, original, inspectText(original, relative.endsWith(".json")));
      } catch {
        omitted.push({ path: relative, originalSha256: sha256(original), reason: "unsafe-uninspectable-or-outside-allowlist" });
      }
    }
    for (const expected of ["evidence.json", "playwright.json"]) {
      if (available.includes(expected) && !included.some(entry => entry.path === expected)) missing.push(`${expected}:not-retainable`);
    }
    const visit = suite => {
      for (const spec of suite.specs ?? []) for (const test of spec.tests ?? []) for (const result of test.results ?? []) {
        const label = `${spec.id}:${test.projectName}:retry-${result.retry}`;
        const attachments = result.attachments ?? [];
        if (["failed", "timedOut"].includes(result.status)) {
          for (const name of ["trace", "screenshot"]) if (!attachments.some(entry => entry.name === name)) missing.push(`${label}:${name}`);
        }
        if (result.status !== "skipped" && /gives Consumer pointer Share Link Fallback|gives Pro keyboard and narrow Share Link Fallback|keeps Client Preview responsive, scope-cancelled, and Pro-gated/.test(spec.title)) {
          if (!attachments.some(entry => entry.name === "pro-visual-observations")) missing.push(`${label}:pro-visual-observations`);
        }
      }
      for (const child of suite.suites ?? []) visit(child);
    };
    if (report) visit(report);
    const payload = included.length > 0;
    if (payload) {
      const inventory = { schema: "interior-ai.pro-visual-diagnostics.v1", sourceCommitSha, sourceTreeSha,
        workflowRunId: environment.GITHUB_RUN_ID ?? null, workflowAttempt: environment.GITHUB_RUN_ATTEMPT ?? null,
        matrixOutcome: environment.PRO_VISUAL_MATRIX_OUTCOME ?? "local-diagnostic-control",
        policy: "Existing retained-text safety audit; inspected ZIP members; private network headers removed; decoded rasters with metadata removed; synthetic fixtures only. Omitted members mean incomplete trace resources.",
        included, omitted, missing };
      writeFileSync(path.join(output, "diagnostic-inventory.json"), inspectText(Buffer.from(JSON.stringify(inventory, null, 2)), true));
    }
    if (environment.GITHUB_OUTPUT) appendFileSync(environment.GITHUB_OUTPUT, `has_payload=${payload}\n`);
    const summary = `Pro diagnostic collection: ${included.length} retained files; ${omitted.length} omitted entries; missing expected results: ${missing.join(", ") || "none"}. Original matrix outcome is unchanged.\n`;
    if (environment.GITHUB_STEP_SUMMARY) appendFileSync(environment.GITHUB_STEP_SUMMARY, summary);
    console.log(summary.trim());
    return { payload, included, omitted, missing };
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  prepareProVisualDiagnostics().catch(error => {
    console.error("Pro diagnostic preparation failed; original matrix result remains authoritative.", error.name);
    process.exitCode = 1;
  });
}
