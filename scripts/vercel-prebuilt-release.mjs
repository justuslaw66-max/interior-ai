import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { verifyVercelOutputManifest } from "./vercel-output-manifest.mjs";

const stagedPath = path.resolve(".vercel/staged-deployment.json");
const certificationPath = path.resolve(".vercel/gate-a3-certification.json");
const command = process.argv[2];

const npxExecutable = process.platform === "win32" ? "npx.cmd" : "npx";
const pinnedVercelArgs = ["--yes", "vercel@56.3.2"];

function run(commandPath, args, options = {}) {
  const result = spawnSync(commandPath, args, { encoding: "utf8", ...options });
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || result.stdout?.trim() || `${commandPath} failed`);
  }
  return result;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function stage() {
  const manifest = await verifyVercelOutputManifest();
  if (manifest.gitTreeStatus !== "clean") {
    throw new Error("Refusing to stage an artifact whose manifest was created from a dirty tracked tree.");
  }
  const result = run(
    npxExecutable,
    [...pinnedVercelArgs, "deploy", "--prebuilt", "--prod", "--skip-domain", "--archive=tgz", "--yes"],
    { stdio: ["inherit", "pipe", "inherit"] },
  );
  const deploymentUrl = result.stdout
    .trim()
    .split(/\s+/)
    .reverse()
    .find((value) => /^https:\/\//.test(value));
  if (!deploymentUrl) throw new Error("Vercel did not return a staged deployment URL.");
  const staged = {
    schema: "interior-ai.vercel-staged-deployment.v1",
    deploymentUrl,
    artifactSha256: manifest.artifactSha256,
    gitCommit: manifest.gitCommit,
    stagedAt: new Date().toISOString(),
  };
  await writeFile(stagedPath, `${JSON.stringify(staged, null, 2)}\n`, "utf8");
  console.log(deploymentUrl);
}

async function certify() {
  const [manifest, staged, reportBytes] = await Promise.all([
    verifyVercelOutputManifest(),
    readFile(stagedPath, "utf8").then(JSON.parse),
    readFile(process.argv[3], "utf8"),
  ]);
  if (staged.artifactSha256 !== manifest.artifactSha256) {
    throw new Error("The staged deployment does not match the current .vercel/output artifact.");
  }
  if (process.env.GATE_A3_CERTIFIED_DEPLOYMENT_URL !== staged.deploymentUrl) {
    throw new Error(
      "GATE_A3_CERTIFIED_DEPLOYMENT_URL must exactly match the recorded staged deployment URL.",
    );
  }
  const report = JSON.parse(reportBytes);
  const stats = report.stats ?? {};
  const allowedSkipped = Number(process.env.GATE_A3_ALLOWED_SKIPPED ?? "0");
  if (!Number.isSafeInteger(allowedSkipped) || allowedSkipped < 0) {
    throw new Error("GATE_A3_ALLOWED_SKIPPED must be a non-negative integer.");
  }
  if (
    stats.unexpected !== 0 ||
    stats.flaky !== 0 ||
    stats.skipped !== allowedSkipped ||
    !(stats.expected > 0)
  ) {
    throw new Error(`Gate A3 report is not clean: ${JSON.stringify(stats)}.`);
  }
  if (report.config?.metadata?.gateA3ReleaseBaseURL !== staged.deploymentUrl) {
    throw new Error("The Playwright report was not produced against the recorded staged deployment URL.");
  }
  const certification = {
    schema: "interior-ai.gate-a3-prebuilt-certification.v1",
    deploymentUrl: staged.deploymentUrl,
    artifactSha256: manifest.artifactSha256,
    gitCommit: manifest.gitCommit,
    reportPath: process.argv[3],
    reportSha256: sha256(reportBytes),
    stats,
    allowedSkipped,
    certifiedAt: new Date().toISOString(),
  };
  await writeFile(certificationPath, `${JSON.stringify(certification, null, 2)}\n`, "utf8");
  console.log(`Certified staged artifact ${certification.artifactSha256}.`);
}

async function promote() {
  const [manifest, staged, certification] = await Promise.all([
    verifyVercelOutputManifest(),
    readFile(stagedPath, "utf8").then(JSON.parse),
    readFile(certificationPath, "utf8").then(JSON.parse),
  ]);
  const identities = [manifest.artifactSha256, staged.artifactSha256, certification.artifactSha256];
  if (new Set(identities).size !== 1 || staged.deploymentUrl !== certification.deploymentUrl) {
    throw new Error("Manifest, staged deployment, and Gate A3 certification identities do not match.");
  }
  run(npxExecutable, [...pinnedVercelArgs, "promote", staged.deploymentUrl, "--yes"], {
    stdio: "inherit",
  });
}

if (command === "stage") await stage();
else if (command === "certify" && process.argv[3]) await certify();
else if (command === "promote") await promote();
else throw new Error("Usage: vercel-prebuilt-release.mjs stage|certify <playwright-report.json>|promote");
