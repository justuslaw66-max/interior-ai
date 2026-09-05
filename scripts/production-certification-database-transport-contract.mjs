import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { CertificationPostgresAdapter } from "./production-certification-database-adapter.mjs";
import {
  STABLE_RUNTIME_SMOKE_DATABASE_CLASSIFICATIONS,
  canonicalJsonBytes,
  databaseAdminPolicy,
  sha256,
} from "./production-certification-database-contract.mjs";
import {
  DATABASE_ADMIN_TRANSPORTS,
  DATABASE_TRANSPORT_ATTESTATION_FILE,
} from "./production-certification-database-transport.mjs";
import { createStableRuntimeRoots } from "./stable-runtime-smoke-resources.mjs";
import {
  configureStableRuntimeDatabaseTransport,
  createGithubPostgresTransportAttestation,
} from "./stable-runtime-smoke-database-transport.mjs";
import { cleanupFailedStableRun } from "./stable-runtime-smoke.mjs";

const repositoryRoot = process.cwd();
const databaseName = `interior_ai_gate_a3_test_cert_${"a".repeat(32)}`;
const lifecycleProfile = {
  classification: STABLE_RUNTIME_SMOKE_DATABASE_CLASSIFICATIONS.lifecycle,
};

function result(stdout = "", status = 0, error = null) {
  return { stdout, stderr: "", status, signal: null, error };
}

function defaultContainer(overrides = {}) {
  return {
    id: "1".repeat(64),
    running: true,
    health: "healthy",
    startedAt: "2026-09-03T01:02:03.000000000Z",
    imageId: `sha256:${"2".repeat(64)}`,
    configuredImage: "postgres:15",
    ports: {
      "5432/tcp": [
        { HostIp: "0.0.0.0", HostPort: "5432" },
        { HostIp: "::", HostPort: "5432" },
      ],
    },
    networks: {
      github_network: {
        NetworkID: "3".repeat(64),
        IPAddress: "172.18.0.2",
        Gateway: "172.18.0.1",
      },
    },
    repoDigests: [`postgres@sha256:${"4".repeat(64)}`],
    ...overrides,
  };
}

function dockerRunner(fixture) {
  return (executable, args) => {
    if (fixture.cliMissing) {
      return result("", null, Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    }
    if (executable !== "docker") return result("", 127);
    if (args[0] === "ps") {
      return result(fixture.containers.map((container) => container.id).join("\n"));
    }
    if (args[0] === "inspect") {
      if (fixture.inspectFailure) return result("", 1);
      const container = fixture.containers.find((entry) => entry.id === args.at(-1));
      return container
        ? result(JSON.stringify({
            running: container.running,
            health: container.health,
            startedAt: container.startedAt,
            imageId: container.imageId,
            configuredImage: container.configuredImage,
            ports: container.ports,
            networks: container.networks,
          }))
        : result("", 1);
    }
    if (args[0] === "image" && args[1] === "inspect") {
      const container = fixture.containers.find(
        (entry) => entry.imageId === args.at(-1),
      );
      return container
        ? result(JSON.stringify([container.imageId, container.repoDigests]))
        : result("", 1);
    }
    return result("", 127);
  };
}

function gitRunner(executable, args, options) {
  return spawnSync(executable, args, options);
}

function githubEnvironment(overrides = {}) {
  return {
    CI: "true",
    GITHUB_ACTIONS: "true",
    RUNNER_ENVIRONMENT: "github-hosted",
    RUNNER_OS: "Linux",
    GITHUB_RUN_ID: "33705660130",
    GITHUB_RUN_ATTEMPT: "1",
    ...overrides,
  };
}

function postgresObservation(overrides = {}) {
  return {
    role: "test",
    database: "postgres",
    server_version: "15.14 (Debian)",
    server_version_num: 150014,
    server_address: "172.18.0.2",
    client_address: "172.18.0.1",
    rolsuper: true,
    rolcreatedb: true,
    ...overrides,
  };
}

function clientFactory(observation, { targetExists = false } = {}) {
  return async () => ({
    async connect() {},
    async end() {},
    async query(sql) {
      if (sql.includes("FROM pg_roles")) {
        return { rows: [observation], rowCount: 1 };
      }
      if (sql.includes("FROM pg_database")) {
        return {
          rows: targetExists ? [{ datname: databaseName }] : [],
          rowCount: targetExists ? 1 : 0,
        };
      }
      throw new Error("unexpected fixture query");
    },
  });
}

function serviceFixture(root, overrides = {}) {
  const lifecycleNonce = "5".repeat(32);
  const environment = githubEnvironment(overrides.environment);
  const docker = { containers: [defaultContainer()], ...overrides.docker };
  const policy = databaseAdminPolicy(
    overrides.adminUrl ?? "postgresql://test:private-fixture@127.0.0.1:5432/postgres",
  );
  const privateRoot = path.join(root, "private");
  mkdirSync(privateRoot, { mode: 0o700 });
  const attestation = createGithubPostgresTransportAttestation({
    repositoryRoot,
    privateRoot,
    environment,
    lifecycleNonce,
    policy,
    commandRunner: dockerRunner(docker),
    gitRunner,
  });
  return {
    adminUrl: policy.url.toString(),
    attestation,
    docker,
    environment: {
      ...environment,
      CERTIFICATION_DATABASE_TRANSPORT_ATTESTATION_PATH: attestation.path,
      CERTIFICATION_DATABASE_TRANSPORT_LIFECYCLE_NONCE: lifecycleNonce,
      CERTIFICATION_WORKTREE_ROOT: privateRoot,
    },
  };
}

function adapterFor(fixture, observation = postgresObservation(), options = {}) {
  return new CertificationPostgresAdapter({
    adminUrl: fixture.adminUrl,
    repositoryRoot,
    environment: fixture.environment,
    lifecycleProfile,
    transportCommandRunner: dockerRunner(fixture.docker),
    adminClientFactory: clientFactory(observation, options),
    expectedServer: options.expectedServer ?? null,
  });
}

async function expectRejected(action, pattern) {
  await assert.rejects(action, pattern);
}

async function urlAndNativeCoverage() {
  for (const [url, pattern] of [
    ["postgresql://owner:secret@192.0.2.1:5432/postgres", /loopback/],
    ["postgresql://owner:secret@localhost:5432/postgres", /loopback/],
    ["postgresql://owner:secret@127.0.0.1:6432/postgres", /port/],
    ["postgresql://owner:secret@127.0.0.1:5432/interior_ai_test", /target postgres/],
    ["postgresql://127.0.0.1:5432/postgres", /role is missing/],
  ]) {
    assert.throws(() => databaseAdminPolicy(url), pattern);
  }
  const native = new CertificationPostgresAdapter({
    adminUrl: "postgresql://owner@127.0.0.1:5432/postgres",
    repositoryRoot,
    adminClientFactory: clientFactory(
      postgresObservation({
        server_version: "16.14",
        server_version_num: 160014,
        server_address: "127.0.0.1",
        client_address: "127.0.0.1",
      }),
    ),
    transportCommandRunner() {
      assert.fail("native-loopback must not invoke Docker");
    },
  });
  const inspected = await native.inspectAdmin(databaseName);
  assert.equal(
    inspected.transportClassification,
    DATABASE_ADMIN_TRANSPORTS.nativeLoopback,
  );
  assert.equal(inspected.transportAttestationSha256, null);
  assert.throws(() => native.targetUrl("interior_ai_test"), /lifecycle owner/);
  await expectRejected(
    () =>
      new CertificationPostgresAdapter({
        adminUrl: "postgresql://owner@127.0.0.1:5432/postgres",
        repositoryRoot,
        adminClientFactory: clientFactory(
          postgresObservation({
            server_version_num: 130019,
            server_address: "127.0.0.1",
          }),
        ),
      }).inspectAdmin(databaseName),
    /classification is not approved/,
  );
  await expectRejected(
    () =>
      new CertificationPostgresAdapter({
        adminUrl: "postgresql://owner@127.0.0.1:5432/postgres",
        repositoryRoot,
        adminClientFactory: clientFactory(
          postgresObservation({
            server_address: "127.0.0.1",
            rolsuper: false,
            rolcreatedb: false,
          }),
        ),
      }).inspectAdmin(databaseName),
    /classification is not approved/,
  );
}

async function exactFormerFailureCoverage() {
  const environment = {
    ...githubEnvironment(),
    CERTIFICATION_WORKTREE_ROOT: tmpdir(),
  };
  const adapter = new CertificationPostgresAdapter({
    adminUrl: "postgresql://test:private-fixture@127.0.0.1:5432/postgres",
    repositoryRoot,
    environment,
    lifecycleProfile,
    adminClientFactory: clientFactory(postgresObservation()),
    transportCommandRunner: dockerRunner({ containers: [defaultContainer()] }),
  });
  await expectRejected(
    () => adapter.inspectAdmin(databaseName),
    /requires valid CERTIFICATION_DATABASE_TRANSPORT_ATTESTATION_PATH/,
  );
  const genericProxy = new CertificationPostgresAdapter({
    adminUrl: "postgresql://test:private-fixture@127.0.0.1:5432/postgres",
    repositoryRoot,
    environment: {},
    lifecycleProfile,
    adminClientFactory: clientFactory(postgresObservation()),
  });
  await expectRejected(
    () => genericProxy.inspectAdmin(databaseName),
    /requires valid CERTIFICATION_DATABASE_TRANSPORT_ATTESTATION_PATH/,
  );
}

async function servicePositiveAndMismatchCoverage() {
  const root = mkdtempSync(path.join(tmpdir(), "database-transport-positive-"));
  try {
    const fixture = serviceFixture(root);
    const inspected = await adapterFor(fixture).inspectAdmin(databaseName);
    assert.equal(
      inspected.transportClassification,
      DATABASE_ADMIN_TRANSPORTS.githubServiceContainer,
    );
    assert.equal(inspected.serverAddressClassification, "attested-container-network");
    assert.match(inspected.transportAttestationSha256, /^[a-f0-9]{64}$/);
    assert.equal(inspected.imageClassification, "official-postgres-major-15");
    const originalAttestationBytes = readFileSync(fixture.attestation.path);

    const preCreateAdapter = adapterFor(fixture);
    await preCreateAdapter.inspectAdmin(databaseName);
    fixture.docker.containers[0].startedAt =
      "2026-09-03T01:02:04.000000000Z";
    await expectRejected(
      () => preCreateAdapter.createDatabase(databaseName),
      /differs from its attestation/,
    );
    fixture.docker.containers[0].startedAt =
      "2026-09-03T01:02:03.000000000Z";

    const substituted = JSON.parse(readFileSync(fixture.attestation.path, "utf8"));
    substituted.creationNonce = "123e4567-e89b-42d3-a456-426614174000";
    const substitutedBody = structuredClone(substituted);
    delete substitutedBody.evidenceSha256;
    substituted.evidenceSha256 = sha256(canonicalJsonBytes(substitutedBody));
    writeFileSync(fixture.attestation.path, canonicalJsonBytes(substituted));
    await expectRejected(
      () => adapterFor(fixture, postgresObservation(), { expectedServer: inspected })
        .inspectAdmin(databaseName),
      /changed during its lifecycle/,
    );
    writeFileSync(fixture.attestation.path, originalAttestationBytes);

    await expectRejected(
      () => adapterFor(fixture, postgresObservation({ server_address: "172.18.0.9" }))
        .inspectAdmin(databaseName),
      /server address is not container-owned/,
    );
    await expectRejected(
      () => adapterFor(fixture, postgresObservation({ client_address: "172.18.0.9" }))
        .inspectAdmin(databaseName),
      /client address is not the network gateway/,
    );
    await expectRejected(
      () => adapterFor(fixture, postgresObservation({ server_version_num: 160014 }))
        .inspectAdmin(databaseName),
      /major version is not approved/,
    );
    const releaseAdapter = adapterFor(fixture);
    releaseAdapter.lifecycleProfile = {
      classification: "RELEASE_CERTIFICATION_DATABASE",
    };
    await expectRejected(
      () => releaseAdapter.inspectAdmin(databaseName),
      /not approved for this profile/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

async function creationRejectionCoverage() {
  const cases = [
    ["outside-actions", { environment: { GITHUB_ACTIONS: "false" } }, /GitHub-hosted/],
    ["self-hosted", { environment: { RUNNER_ENVIRONMENT: "self-hosted" } }, /GitHub-hosted/],
    ["docker-missing", { docker: { containers: [], cliMissing: true } }, /discovery failed/],
    ["inspect-failure", { docker: { containers: [defaultContainer()], inspectFailure: true } }, /inspection failed/],
    ["zero-container", { docker: { containers: [] } }, /exactly one/],
    ["multiple-container", { docker: { containers: [defaultContainer(), defaultContainer({ id: "6".repeat(64) })] } }, /exactly one/],
    ["stopped", { docker: { containers: [defaultContainer({ running: false })] } }, /not running/],
    ["unhealthy", { docker: { containers: [defaultContainer({ health: "starting" })] } }, /not healthy/],
    ["wrong-host-port", { docker: { containers: [defaultContainer({ ports: { "5432/tcp": [{ HostIp: "0.0.0.0", HostPort: "6432" }] } })] } }, /exactly one/],
    ["wrong-container-port", { docker: { containers: [defaultContainer({ ports: { "6432/tcp": [{ HostIp: "0.0.0.0", HostPort: "5432" }] } })] } }, /not exact/],
    ["wrong-image", { docker: { containers: [defaultContainer({ configuredImage: "example/postgres:15" })] } }, /image is not approved/],
    ["wrong-repository", { docker: { containers: [defaultContainer({ repoDigests: [`example/postgres@sha256:${"4".repeat(64)}`] })] } }, /repository identity/],
  ];
  for (const [name, overrides, pattern] of cases) {
    const root = mkdtempSync(path.join(tmpdir(), `database-transport-${name}-`));
    try {
      assert.throws(() => serviceFixture(root, overrides), pattern);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
  const missingPasswordRoot = mkdtempSync(path.join(tmpdir(), "database-transport-no-password-"));
  try {
    assert.throws(
      () => serviceFixture(missingPasswordRoot, {
        adminUrl: "postgresql://test@127.0.0.1:5432/postgres",
      }),
      /password is missing/,
    );
  } finally {
    rmSync(missingPasswordRoot, { recursive: true, force: true });
  }
}

async function retainedAttestationRejectionCoverage() {
  const mutations = [
    ["foreign-run", (fixture) => { fixture.environment.GITHUB_RUN_ID = "33705660131"; }, /stale or foreign/],
    ["foreign-attempt", (fixture) => { fixture.environment.GITHUB_RUN_ATTEMPT = "2"; }, /stale or foreign/],
    ["foreign-nonce", (fixture) => { fixture.environment.CERTIFICATION_DATABASE_TRANSPORT_LIFECYCLE_NONCE = "6".repeat(32); }, /stale or foreign/],
    ["stale-container", (fixture) => { fixture.docker.containers[0].id = "7".repeat(64); }, /differs from its attestation/],
    ["replacement", (fixture) => {
      fixture.docker.containers[0].id = "8".repeat(64);
      fixture.docker.containers[0].startedAt = "2026-09-03T02:03:04.000000000Z";
      fixture.docker.containers[0].networks.github_network.IPAddress = "172.18.0.3";
    }, /differs from its attestation/],
    ["repository-digest-changed", (fixture) => {
      fixture.docker.containers[0].repoDigests = [
        `postgres@sha256:${"9".repeat(64)}`,
      ];
    }, /differs from its attestation/],
    ["malformed-json", (fixture) => {
      writeFileSync(fixture.attestation.path, "{");
    }, /attestation JSON is malformed/],
    ["canonical-json", (fixture) => {
      const value = JSON.parse(readFileSync(fixture.attestation.path, "utf8"));
      writeFileSync(fixture.attestation.path, JSON.stringify(value));
    }, /not canonical/],
    ["sha", (fixture) => {
      const value = JSON.parse(readFileSync(fixture.attestation.path, "utf8"));
      value.evidenceSha256 = "0".repeat(64);
      writeFileSync(fixture.attestation.path, canonicalJsonBytes(value));
    }, /SHA is invalid/],
  ];
  for (const [name, mutate, pattern] of mutations) {
    const root = mkdtempSync(path.join(tmpdir(), `database-transport-${name}-`));
    try {
      const fixture = serviceFixture(root);
      mutate(fixture);
      await expectRejected(
        () => adapterFor(fixture).inspectAdmin(databaseName),
        pattern,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  const existingRoot = mkdtempSync(path.join(tmpdir(), "database-transport-existing-"));
  try {
    const fixture = serviceFixture(existingRoot);
    assert.throws(
      () => createGithubPostgresTransportAttestation({
        repositoryRoot,
        privateRoot: fixture.environment.CERTIFICATION_WORKTREE_ROOT,
        environment: fixture.environment,
        lifecycleNonce:
          fixture.environment.CERTIFICATION_DATABASE_TRANSPORT_LIFECYCLE_NONCE,
        policy: databaseAdminPolicy(fixture.adminUrl),
        commandRunner: dockerRunner(fixture.docker),
        gitRunner,
      }),
      /EEXIST|already exists/,
    );
  } finally {
    rmSync(existingRoot, { recursive: true, force: true });
  }

  const symlinkContainer = mkdtempSync(path.join(tmpdir(), "database-transport-symlink-"));
  const physical = path.join(symlinkContainer, "physical");
  const symbolic = path.join(symlinkContainer, "symbolic");
  try {
    mkdirSync(physical, { mode: 0o700 });
    symlinkSync(physical, symbolic);
    assert.throws(
      () => createGithubPostgresTransportAttestation({
        repositoryRoot,
        privateRoot: symbolic,
        environment: githubEnvironment(),
        lifecycleNonce: "5".repeat(32),
        policy: databaseAdminPolicy("postgresql://test:secret@127.0.0.1:5432/postgres"),
        commandRunner: dockerRunner({ containers: [defaultContainer()] }),
        gitRunner,
      }),
      /cannot be symbolic/,
    );
    assert.throws(
      () => createGithubPostgresTransportAttestation({
        repositoryRoot,
        privateRoot: repositoryRoot,
        environment: githubEnvironment(),
        lifecycleNonce: "5".repeat(32),
        policy: databaseAdminPolicy("postgresql://test:secret@127.0.0.1:5432/postgres"),
        commandRunner: dockerRunner({ containers: [defaultContainer()] }),
        gitRunner,
      }),
      /outside Git worktrees/,
    );
  } finally {
    rmSync(symlinkContainer, { recursive: true, force: true });
  }

  const modeRoot = mkdtempSync(path.join(tmpdir(), "database-transport-mode-"));
  try {
    const fixture = serviceFixture(modeRoot);
    chmodSync(fixture.attestation.path, 0o644);
    await expectRejected(
      () => adapterFor(fixture).inspectAdmin(databaseName),
      /mode-0600/,
    );
    assert.equal(
      path.basename(fixture.attestation.path),
      DATABASE_TRANSPORT_ATTESTATION_FILE,
    );
  } finally {
    rmSync(modeRoot, { recursive: true, force: true });
  }
}

async function stableParentPreCreateCleanupCoverage() {
  const runnerTemp = mkdtempSync(path.join(tmpdir(), "database-transport-parent-"));
  const manifest = {
    candidateIdentifier: "github-33705660130-1",
    source: { commitSha: "a".repeat(40), treeSha: "b".repeat(40) },
  };
  const environment = {
    ...githubEnvironment(),
    RUNNER_TEMP: runnerTemp,
    STABLE_RUNTIME_SMOKE_EXPECTED_SOURCE_SHA: manifest.source.commitSha,
  };
  let roots = null;
  try {
    roots = createStableRuntimeRoots({ repositoryRoot, environment, manifest });
    const lifecycleEnvironment = configureStableRuntimeDatabaseTransport({
      repositoryRoot,
      environment,
      roots,
      lifecycleEnvironment: {
        CERTIFICATION_DATABASE_ADMIN_URL:
          "postgresql://test:private-fixture@127.0.0.1:5432/postgres",
        CERTIFICATION_DATABASE_LIFECYCLE_PATH: path.join(
          roots.evidenceRoot,
          "database/lifecycle.json",
        ),
      },
      commandRunner: dockerRunner({ containers: [defaultContainer()] }),
      gitRunner,
    });
    assert.equal(existsSync(lifecycleEnvironment.CERTIFICATION_DATABASE_TRANSPORT_ATTESTATION_PATH), true);
    assert.equal(existsSync(path.join(roots.evidenceRoot, "database/lifecycle.json")), false);
    const injected = new Error("injected post-attestation pre-create failure");
    assert.match(injected.message, /pre-create failure/);
    const context = {
      repositoryRoot,
      lifecycleEnvironment,
      roots,
      consumed: false,
      bundleStarted: false,
      manifestFinalized: false,
    };
    await cleanupFailedStableRun(context, injected);
    assert.equal(context.roots, null);
    assert.equal(existsSync(roots.taskRoot), false);
    roots = null;
  } finally {
    if (roots?.taskRoot) rmSync(roots.taskRoot, { recursive: true, force: true });
    rmSync(runnerTemp, { recursive: true, force: true });
  }
}

export async function databaseTransportContractCoverage() {
  await urlAndNativeCoverage();
  await exactFormerFailureCoverage();
  await servicePositiveAndMismatchCoverage();
  await creationRejectionCoverage();
  await retainedAttestationRejectionCoverage();
  await stableParentPreCreateCleanupCoverage();
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  await databaseTransportContractCoverage();
  console.log("Production certification database transport contract coverage passed.");
}
