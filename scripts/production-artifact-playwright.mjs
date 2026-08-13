import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";

import {
  PRODUCTION_EVIDENCE_JOURNAL_PATH,
  validateCurrentProductionEvidenceManifest,
} from "./production-artifact-contract.mjs";
import {
  PLAYWRIGHT_EXTERNAL_EVIDENCE_ROOT,
  resolvePlaywrightReportPath,
} from "./playwright-report-path.mjs";

function repositoryPath(repositoryRoot, relativePath, description) {
  if (typeof relativePath !== "string" || relativePath.length === 0) {
    throw new Error(`${description} is required.`);
  }
  if (path.isAbsolute(relativePath)) {
    throw new Error(`${description} must be repository-relative.`);
  }
  const root = path.resolve(repositoryRoot);
  const resolved = path.resolve(root, relativePath);
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${description} must remain inside the repository.`);
  }
  return resolved;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function readCanonicalJson(absolutePath, description) {
  let bytes;
  try {
    bytes = readFileSync(absolutePath);
  } catch {
    throw new Error(`${description} is missing or unreadable.`);
  }
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`${description} is not valid JSON.`);
  }
  const canonical = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  if (!bytes.equals(canonical)) {
    throw new Error(`${description} is not canonical JSON.`);
  }
  return { bytes, value };
}

function requiredExpectation(environment, name) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`Production artifact preflight is missing ${name}.`);
  return value;
}

function validateEnvironmentMode(manifest, environment) {
  const appEnvironment = environment.APP_ENV?.trim().toLowerCase();
  const publicEnvironment = environment.NEXT_PUBLIC_APP_ENV?.trim().toLowerCase();
  if (
    appEnvironment !== manifest.build.applicationEnvironment ||
    publicEnvironment !== appEnvironment
  ) {
    throw new Error("Production artifact environment identity is contradictory.");
  }
  const vercelEnvironment = environment.VERCEL_ENV?.trim().toLowerCase() || null;
  const allowedVercelEnvironment =
    vercelEnvironment === null ||
    (appEnvironment === "staging" && vercelEnvironment === "preview") ||
    (appEnvironment === "production" && vercelEnvironment === "production");
  if (!allowedVercelEnvironment) {
    throw new Error("Production artifact Vercel environment identity is contradictory.");
  }
}

export function loadProductionArtifactForPlaywright({
  repositoryRoot,
  manifestPath,
  reportPath,
  useProductionServer,
  releaseBaseURL,
  environment,
}) {
  if (!manifestPath) throw new Error("Production evidence manifest path is required.");
  if (!useProductionServer) {
    throw new Error(
      "Production artifact evidence requires PLAYWRIGHT_USE_PRODUCTION_SERVER=1.",
    );
  }
  if (releaseBaseURL) {
    throw new Error(
      "Local production artifact evidence cannot be presented as HTTPS deployment evidence.",
    );
  }
  const journalPath = requiredExpectation(
    environment,
    "PRODUCTION_EVIDENCE_JOURNAL_PATH",
  );
  if (journalPath !== PRODUCTION_EVIDENCE_JOURNAL_PATH) {
    throw new Error("Production evidence semantic event journal path is not canonical.");
  }
  const canonicalValidation = spawnSync(
    process.execPath,
    [
      realpathSync(
        repositoryPath(
          repositoryRoot,
          "scripts/production-artifact-evidence.mjs",
          "Production artifact validator path",
        ),
      ),
      "verify-preflight",
    ],
    {
      cwd: repositoryRoot,
      env: { ...environment, PRODUCTION_EVIDENCE_MANIFEST: manifestPath },
      encoding: "utf8",
    },
  );
  if (canonicalValidation.status !== 0) {
    throw new Error("Production artifact canonical validation failed.");
  }
  const absoluteManifestPath = repositoryPath(
    repositoryRoot,
    manifestPath,
    "Production evidence manifest path",
  );
  const manifestRead = readCanonicalJson(
    absoluteManifestPath,
    "Production evidence manifest",
  );
  const expectedManifestSha256 = requiredExpectation(
    environment,
    "PRODUCTION_EVIDENCE_EXPECTED_MANIFEST_SHA256",
  );
  if (sha256(manifestRead.bytes) !== expectedManifestSha256) {
    throw new Error("Production evidence manifest does not match canonical preflight.");
  }
  let sidecar;
  try {
    sidecar = readFileSync(`${absoluteManifestPath}.sha256`, "utf8");
  } catch {
    throw new Error("Production evidence manifest SHA-256 sidecar is missing or unreadable.");
  }
  if (sidecar !== `${expectedManifestSha256}  ${path.basename(absoluteManifestPath)}\n`) {
    throw new Error("Production evidence manifest SHA-256 sidecar is invalid.");
  }
  const absoluteJournalPath = repositoryPath(
    repositoryRoot,
    journalPath,
    "Production evidence semantic event journal path",
  );
  const journalRead = readCanonicalJson(
    absoluteJournalPath,
    "Production evidence semantic event journal",
  );
  const validation = validateCurrentProductionEvidenceManifest({
    manifest: manifestRead.value,
    semanticJournal: journalRead.value,
    expectedIdentity: {
      sourceCommitSha: requiredExpectation(
        environment,
        "PRODUCTION_EVIDENCE_EXPECTED_COMMIT_SHA",
      ),
      sourceTreeSha: requiredExpectation(
        environment,
        "PRODUCTION_EVIDENCE_EXPECTED_TREE_SHA",
      ),
      nextBuildId: requiredExpectation(
        environment,
        "PRODUCTION_EVIDENCE_EXPECTED_BUILD_ID",
      ),
      artifactSha256: requiredExpectation(
        environment,
        "PRODUCTION_EVIDENCE_EXPECTED_ARTIFACT_SHA256",
      ),
    },
    requirePendingTests: true,
  });
  if (!validation.valid) {
    throw new Error(`Production artifact evidence manifest rejected: ${validation.issues.join("; ")}`);
  }
  validateEnvironmentMode(manifestRead.value, environment);
  const reportDestination = resolvePlaywrightReportPath({
    requestedPath: reportPath,
    repositoryRoot,
    authorizedExternalRoot: environment[PLAYWRIGHT_EXTERNAL_EVIDENCE_ROOT],
  });
  return Object.freeze({
    identity: validation.identity,
    reportDestination,
  });
}
