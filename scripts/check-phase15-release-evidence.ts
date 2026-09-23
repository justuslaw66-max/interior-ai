import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  Phase15ReleaseManifestSchema,
  validatePhase15ReleasePackage,
} from "@/lib/phase15-release-evidence";

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function readJson(path: string) {
  const bytes = readFileSync(resolve(process.cwd(), path));
  return { bytes, value: JSON.parse(bytes.toString("utf8")) as unknown };
}

function readSignature(path: string | undefined) {
  if (!path) return undefined;
  const bytes = readFileSync(resolve(process.cwd(), path));
  if (bytes.length === 64) return bytes;
  const encoded = bytes.toString("utf8").trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error("Detached signature must be raw Ed25519 bytes or base64 text.");
  return Buffer.from(encoded, "base64");
}

function gitOutput(args: string[]) {
  try {
    return execFileSync("git", args, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

const manifestPath = option("--manifest");
const humanPath = option("--human-evidence");
const signaturePath = option("--signature");
const publicKeyPath = option("--trusted-public-key") ?? process.env.PHASE15_TRUSTED_PRODUCT_OWNER_PUBLIC_KEY_PATH;
const reportOnly = process.argv.includes("--report-only");

if (!manifestPath || !humanPath) {
  console.error("Usage: npm run check:phase15-release-evidence -- --manifest <manifest.json> --human-evidence <bundle.json> [--signature <signature>] [--trusted-public-key <public.pem>] [--report-only]");
  process.exit(2);
}

try {
  const manifest = readJson(manifestPath);
  const human = readJson(humanPath);
  const trustedKey = publicKeyPath
    ? readFileSync(resolve(process.cwd(), publicKeyPath))
    : undefined;
  const result = validatePhase15ReleasePackage({
    manifest: manifest.value,
    manifestBytes: manifest.bytes,
    humanEvidence: human.value,
    humanEvidenceBytes: human.bytes,
    repositoryRoot: process.cwd(),
    detachedSignature: readSignature(signaturePath),
    trustedProductOwnerPublicKey: trustedKey,
  });

  const parsedManifest = Phase15ReleaseManifestSchema.safeParse(manifest.value);
  if (parsedManifest.success) {
    const expectedCommit = parsedManifest.data.commitSha;
    const tagCommit = gitOutput(["rev-list", "-n", "1", parsedManifest.data.immutableTag]);
    const head = gitOutput(["rev-parse", "HEAD"]);
    if (!tagCommit) {
      result.issues.push({ level: "error", path: "manifest.immutableTag", message: "immutable tag does not exist in this repository" });
      result.evidenceComplete = false;
      result.releaseReady = false;
    } else if (tagCommit !== expectedCommit) {
      result.issues.push({ level: "error", path: "manifest.immutableTag", message: "tag does not resolve to the candidate commit" });
      result.evidenceComplete = false;
      result.releaseReady = false;
    }
    if (!head) {
      result.issues.push({ level: "error", path: "manifest.commitSha", message: "could not resolve the checked-out commit" });
      result.evidenceComplete = false;
      result.releaseReady = false;
    } else if (head !== expectedCommit) {
      result.issues.push({ level: "error", path: "manifest.commitSha", message: "checked-out HEAD does not match the candidate commit" });
      result.evidenceComplete = false;
      result.releaseReady = false;
    }
    const status = gitOutput(["status", "--porcelain", "--untracked-files=all"]);
    if (status === null) {
      result.issues.push({ level: "error", path: "manifest.cleanCheckoutConfirmed", message: "could not inspect the working tree" });
      result.evidenceComplete = false;
      result.releaseReady = false;
    } else if (status) {
      result.issues.push({ level: "error", path: "manifest.cleanCheckoutConfirmed", message: "working tree is not clean" });
      result.evidenceComplete = false;
      result.releaseReady = false;
    }
  }

  const counts = result.issues.reduce(
    (current, issue) => ({ ...current, [issue.level]: current[issue.level] + 1 }),
    { error: 0, blocker: 0, approval: 0 },
  );
  console.log("Phase 15 release evidence");
  console.log(`- structurally valid: ${result.structurallyValid ? "yes" : "no"}`);
  console.log(`- evidence complete: ${result.evidenceComplete ? "yes" : "no"}`);
  console.log(`- approval valid: ${result.approvalValid ? "yes" : "no"}`);
  console.log(`- release ready: ${result.releaseReady ? "yes" : "no"}`);
  console.log(`- issues: ${counts.error} errors, ${counts.blocker} blockers, ${counts.approval} approval`);
  for (const issue of result.issues) console.log(`  [${issue.level}] ${issue.path}: ${issue.message}`);

  if (!result.structurallyValid) process.exit(2);
  if (!result.releaseReady && !reportOnly) process.exit(1);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}
