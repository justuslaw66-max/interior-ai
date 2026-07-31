import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { validateRequiredTestEvidence } from "./required-test-truthfulness.mjs";
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
    { stdio: ["inherit", "pipe", "pipe"] },
  );
  if (result.stderr) process.stderr.write(result.stderr);
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.replace(
    /\u001b\[[0-9;]*m/g,
    "",
  );
  const deploymentUrl =
    output.match(/(?:Production|Preview)\s+(https:\/\/[^\s]+)/)?.[1] ??
    output.match(/https:\/\/[^\s]+\.vercel\.app/)?.[0];
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

export function validateGateA3CertificationEvidence({
  repositoryRoot,
  manifest,
  staged,
  evidencePath,
  certifiedDeploymentUrl,
  gateId = "release.gate-a3",
}) {
  if (staged.artifactSha256 !== manifest.artifactSha256) {
    throw new Error("The staged deployment does not match the current .vercel/output artifact.");
  }
  if (staged.gitCommit !== manifest.gitCommit) {
    throw new Error("The staged deployment does not match the current source commit.");
  }
  if (certifiedDeploymentUrl !== staged.deploymentUrl) {
    throw new Error(
      "GATE_A3_CERTIFIED_DEPLOYMENT_URL must exactly match the recorded staged deployment URL.",
    );
  }
  const evidenceResult = validateRequiredTestEvidence({
    repositoryRoot,
    gateId,
    evidencePath,
    expectedSourceCommitSha: manifest.gitCommit,
    expectedArtifactSha256: manifest.artifactSha256,
    expectedBaseURL: staged.deploymentUrl,
  });
  if (!evidenceResult.valid) {
    throw new Error(`Gate A3 evidence is not truthful: ${evidenceResult.issues.join("; ")}.`);
  }
  return evidenceResult;
}

export async function validateGateA3PromotionCertification({
  repositoryRoot,
  manifest,
  staged,
  certification,
  gateId = "release.gate-a3",
}) {
  if (certification.schema !== "interior-ai.gate-a3-prebuilt-certification.v1") {
    throw new Error("Gate A3 certification schema is unsupported.");
  }
  const artifactIdentities = [
    manifest.artifactSha256,
    staged.artifactSha256,
    certification.artifactSha256,
  ];
  const sourceIdentities = [manifest.gitCommit, staged.gitCommit, certification.gitCommit];
  if (
    new Set(artifactIdentities).size !== 1 ||
    new Set(sourceIdentities).size !== 1 ||
    staged.deploymentUrl !== certification.deploymentUrl
  ) {
    throw new Error("Manifest, staged deployment, and Gate A3 certification identities do not match.");
  }
  if (typeof certification.requiredTestEvidencePath !== "string") {
    throw new Error("Gate A3 certification is missing its required-test evidence path.");
  }
  const root = path.resolve(repositoryRoot);
  const evidenceAbsolutePath = path.resolve(root, certification.requiredTestEvidencePath);
  if (!evidenceAbsolutePath.startsWith(`${root}${path.sep}`)) {
    throw new Error("Gate A3 certification evidence path must remain inside the repository.");
  }
  const evidenceBytes = await readFile(evidenceAbsolutePath);
  if (sha256(evidenceBytes) !== certification.requiredTestEvidenceSha256) {
    throw new Error("Gate A3 certification required-test evidence SHA-256 does not match.");
  }
  const evidenceResult = validateGateA3CertificationEvidence({
    repositoryRoot: root,
    manifest,
    staged,
    evidencePath: certification.requiredTestEvidencePath,
    certifiedDeploymentUrl: staged.deploymentUrl,
    gateId,
  });
  if (
    certification.reportPath !== evidenceResult.evidence.report.path ||
    certification.reportSha256 !== evidenceResult.evidence.report.sha256 ||
    JSON.stringify(certification.stats) !== JSON.stringify(evidenceResult.report.stats)
  ) {
    throw new Error("Gate A3 certification report identity or statistics do not match current evidence.");
  }
  return evidenceResult;
}

async function certify() {
  const evidencePath = process.argv[3];
  const [manifest, staged, evidenceBytes] = await Promise.all([
    verifyVercelOutputManifest(),
    readFile(stagedPath, "utf8").then(JSON.parse),
    readFile(evidencePath, "utf8"),
  ]);
  const evidenceResult = validateGateA3CertificationEvidence({
    repositoryRoot: process.cwd(),
    manifest,
    staged,
    evidencePath,
    certifiedDeploymentUrl: process.env.GATE_A3_CERTIFIED_DEPLOYMENT_URL,
  });
  const certification = {
    schema: "interior-ai.gate-a3-prebuilt-certification.v1",
    deploymentUrl: staged.deploymentUrl,
    artifactSha256: manifest.artifactSha256,
    gitCommit: manifest.gitCommit,
    requiredTestEvidencePath: evidencePath,
    requiredTestEvidenceSha256: sha256(evidenceBytes),
    reportPath: evidenceResult.evidence.report.path,
    reportSha256: evidenceResult.evidence.report.sha256,
    stats: evidenceResult.report.stats,
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
  await validateGateA3PromotionCertification({
    repositoryRoot: process.cwd(),
    manifest,
    staged,
    certification,
  });
  run(npxExecutable, [...pinnedVercelArgs, "promote", staged.deploymentUrl, "--yes"], {
    stdio: "inherit",
  });
}

async function cli() {
  if (command === "stage") await stage();
  else if (command === "certify" && process.argv[3]) await certify();
  else if (command === "promote") await promote();
  else throw new Error("Usage: vercel-prebuilt-release.mjs stage|certify <required-test-evidence.json>|promote");
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  await cli();
}
