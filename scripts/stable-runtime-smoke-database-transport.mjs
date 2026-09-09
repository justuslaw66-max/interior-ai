import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { lstatSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  canonicalJsonBytes,
  databaseAdminPolicy,
  sha256,
} from "./production-certification-database-contract.mjs";
import {
  DATABASE_ADMIN_TRANSPORTS,
  DATABASE_TRANSPORT_ATTESTATION_FILE,
  DATABASE_TRANSPORT_ATTESTATION_SCHEMA,
  databaseTransportRunnerIdentity,
  inspectGithubPostgresServiceContainer,
} from "./production-certification-database-transport.mjs";

function defaultCommandRunner(executable, args, options) {
  return spawnSync(executable, args, options);
}

function gitWorktreeRoots(repositoryRoot, gitRunner) {
  const child = gitRunner(
    "git",
    ["worktree", "list", "--porcelain"],
    { cwd: repositoryRoot, encoding: "utf8", maxBuffer: 1024 * 1024 },
  );
  if (child.error || child.signal || child.status !== 0) {
    throw new Error("database transport worktree inspection failed");
  }
  return child.stdout
    .trim()
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => realpathSync(line.slice("worktree ".length)));
}

function physicalPrivateRoot(repositoryRoot, privateRoot, gitRunner) {
  if (lstatSync(privateRoot).isSymbolicLink()) {
    throw new Error("database transport attestation root cannot be symbolic");
  }
  const physicalRoot = realpathSync(privateRoot);
  if (!lstatSync(physicalRoot).isDirectory()) {
    throw new Error("database transport attestation root must be a directory");
  }
  if (
    gitWorktreeRoots(repositoryRoot, gitRunner).some(
      (root) => physicalRoot === root || physicalRoot.startsWith(`${root}${path.sep}`),
    )
  ) {
    throw new Error("database transport attestation root must be outside Git worktrees");
  }
  return physicalRoot;
}

export function createGithubPostgresTransportAttestation({
  repositoryRoot,
  privateRoot,
  environment,
  lifecycleNonce,
  policy,
  commandRunner = defaultCommandRunner,
  gitRunner = defaultCommandRunner,
} = {}) {
  const root = physicalPrivateRoot(repositoryRoot, privateRoot, gitRunner);
  const runner = databaseTransportRunnerIdentity(environment);
  if (!/^[0-9a-f-]{32,64}$/.test(lifecycleNonce)) {
    throw new Error("database transport lifecycle nonce is malformed");
  }
  if (!policy.url.password) {
    throw new Error("database transport service administrator password is missing");
  }
  const body = {
    schema: DATABASE_TRANSPORT_ATTESTATION_SCHEMA,
    version: 1,
    transportProfile: DATABASE_ADMIN_TRANSPORTS.githubServiceContainer,
    runner,
    lifecycleNonceSha256: sha256(lifecycleNonce),
    creationNonce: randomUUID(),
    endpoint: {
      hostClassification: policy.hostClassification,
      port: policy.port,
      adminDatabase: policy.adminDatabase,
      passwordPresent: true,
    },
    snapshot: inspectGithubPostgresServiceContainer({
      repositoryRoot,
      commandRunner,
    }),
  };
  const value = { ...body, evidenceSha256: sha256(canonicalJsonBytes(body)) };
  const filePath = path.join(root, DATABASE_TRANSPORT_ATTESTATION_FILE);
  writeFileSync(filePath, canonicalJsonBytes(value), { flag: "wx", mode: 0o600 });
  return Object.freeze({ path: filePath, sha256: sha256(canonicalJsonBytes(value)) });
}

export function configureStableRuntimeDatabaseTransport({
  repositoryRoot,
  environment,
  lifecycleEnvironment,
  roots,
  commandRunner,
  gitRunner,
}) {
  if (environment.GITHUB_ACTIONS !== "true") return lifecycleEnvironment;
  const attestation = createGithubPostgresTransportAttestation({
    repositoryRoot,
    privateRoot: roots.privateRoot,
    environment,
    lifecycleNonce: roots.owner.lifecycleNonce,
    policy: databaseAdminPolicy(
      lifecycleEnvironment.CERTIFICATION_DATABASE_ADMIN_URL,
    ),
    commandRunner,
    gitRunner,
  });
  return {
    ...lifecycleEnvironment,
    CERTIFICATION_DATABASE_TRANSPORT_ATTESTATION_PATH: attestation.path,
    CERTIFICATION_DATABASE_TRANSPORT_LIFECYCLE_NONCE:
      roots.owner.lifecycleNonce,
  };
}
