import { spawnSync } from "node:child_process";
import {
  lstatSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import path from "node:path";

import {
  STABLE_RUNTIME_SMOKE_DATABASE_CLASSIFICATIONS,
  canonicalJsonBytes,
  isSha256,
  sha256,
} from "./production-certification-database-contract.mjs";

export const DATABASE_ADMIN_TRANSPORTS = Object.freeze({
  nativeLoopback: "native-loopback",
  githubServiceContainer:
    "github-hosted-service-container-loopback-forward",
});
export const GITHUB_POSTGRES_SERVICE_POLICY = Object.freeze({
  configuredImage: "postgres:15",
  imageClassification: "official-postgres-major-15",
  postgresMajor: 15,
  hostPort: 5432,
  containerPort: 5432,
});
export const DATABASE_TRANSPORT_ATTESTATION_SCHEMA =
  "interior-ai.github-service-postgres-transport-attestation.v1";
export const DATABASE_TRANSPORT_ATTESTATION_FILE =
  "postgres-transport-attestation.json";

function exactKeys(value, keys) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join("\n") === [...keys].sort().join("\n")
  );
}

function required(environment, name, pattern = null) {
  const value = environment[name]?.trim();
  if (!value || (pattern && !pattern.test(value))) {
    throw new Error(`database transport requires valid ${name}`);
  }
  return value;
}

function defaultCommandRunner(executable, args, options) {
  return spawnSync(executable, args, options);
}

function run(commandRunner, executable, args, description, cwd) {
  const child = commandRunner(executable, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  if (child.error || child.signal || child.status !== 0) {
    throw new Error(`database transport ${description} failed`);
  }
  return child.stdout.trim();
}

function parseJson(value, description) {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`database transport ${description} is malformed`);
  }
}

function officialRepoDigest(repoDigests) {
  const matches = repoDigests
    .map((value) =>
      value.match(
        /^(?:docker\.io\/)?(?:library\/)?postgres@(sha256:[a-f0-9]{64})$/,
      )?.[1],
    )
    .filter(Boolean);
  const digests = [...new Set(matches)];
  if (digests.length !== 1) {
    throw new Error("database transport image repository identity is not approved");
  }
  return `postgres@${digests[0]}`;
}

function configuredImageApproved(value) {
  return new Set([
    "postgres:15",
    "docker.io/library/postgres:15",
  ]).has(value);
}

const CONTAINER_TEMPLATE = [
  "{",
  '"running":{{json .State.Running}},',
  '"health":{{if .State.Health}}{{json .State.Health.Status}}{{else}}null{{end}},',
  '"startedAt":{{json .State.StartedAt}},',
  '"imageId":{{json .Image}},',
  '"configuredImage":{{json .Config.Image}},',
  '"ports":{{json .NetworkSettings.Ports}},',
  '"networks":{{json .NetworkSettings.Networks}}',
  "}",
].join("");
const IMAGE_TEMPLATE =
  '{{printf "[%s,%s]" (json .Id) (json .RepoDigests)}}';

function publishedPortEntries(container) {
  return Object.entries(container.ports ?? {}).flatMap(([containerPort, bindings]) =>
    (bindings ?? []).map((binding) => ({ containerPort, ...binding })),
  );
}

function networkFacts(networks) {
  const facts = Object.values(networks ?? {})
    .filter((network) => network?.IPAddress && network?.NetworkID)
    .map((network) => ({
      identitySha256: sha256(network.NetworkID),
      address: network.IPAddress,
      gateway: network.Gateway || null,
    }))
    .sort((left, right) => left.identitySha256.localeCompare(right.identitySha256));
  if (facts.length === 0) {
    throw new Error("database transport container network identity is missing");
  }
  return facts;
}

export function inspectGithubPostgresServiceContainer({
  repositoryRoot,
  commandRunner = defaultCommandRunner,
} = {}) {
  const ids = run(
    commandRunner,
    "docker",
    ["ps", "--all", "--no-trunc", "--format", "{{.ID}}"],
    "Docker container discovery",
    repositoryRoot,
  ).split("\n").filter(Boolean);
  const inspected = ids.map((id) => ({
    id,
    value: parseJson(
      run(
        commandRunner,
        "docker",
        ["inspect", "--type", "container", "--format", CONTAINER_TEMPLATE, id],
        "Docker container inspection",
        repositoryRoot,
      ),
      "Docker container inspection",
    ),
  }));
  const owners = inspected.filter(({ value }) =>
    publishedPortEntries(value).some(
      (entry) => Number(entry.HostPort) === GITHUB_POSTGRES_SERVICE_POLICY.hostPort,
    ),
  );
  if (owners.length !== 1) {
    throw new Error("database transport requires exactly one published-port owner");
  }
  const [{ id, value: container }] = owners;
  if (container.running !== true) {
    throw new Error("database transport service container is not running");
  }
  if (container.health !== "healthy") {
    throw new Error("database transport service container is not healthy");
  }
  const bindings = publishedPortEntries(container);
  if (
    bindings.length === 0 ||
    bindings.some(
      (binding) =>
        binding.containerPort !== "5432/tcp" ||
        Number(binding.HostPort) !== GITHUB_POSTGRES_SERVICE_POLICY.hostPort,
    )
  ) {
    throw new Error("database transport published PostgreSQL port is not exact");
  }
  const hostIpClassifications = new Map([
    ["127.0.0.1", "loopback"],
    ["::1", "loopback"],
    ["0.0.0.0", "ephemeral-runner-all-ipv4"],
    ["::", "ephemeral-runner-all-ipv6"],
  ]);
  const publishedHostClassifications = [
    ...new Set(bindings.map((binding) => hostIpClassifications.get(binding.HostIp))),
  ].sort();
  if (publishedHostClassifications.includes(undefined)) {
    throw new Error("database transport published host address is not approved");
  }
  if (!configuredImageApproved(container.configuredImage)) {
    throw new Error("database transport configured image is not approved");
  }
  const [imageId, repoDigests] = parseJson(
    run(
      commandRunner,
      "docker",
      ["image", "inspect", "--format", IMAGE_TEMPLATE, container.imageId],
      "Docker image inspection",
      repositoryRoot,
    ),
    "Docker image inspection",
  );
  if (imageId !== container.imageId || !/^sha256:[a-f0-9]{64}$/.test(imageId)) {
    throw new Error("database transport image ID is inconsistent");
  }
  const repositoryDigest = officialRepoDigest(repoDigests ?? []);
  if (!container.startedAt || !Number.isFinite(Date.parse(container.startedAt))) {
    throw new Error("database transport container start time is malformed");
  }
  return Object.freeze({
    containerIdentitySha256: sha256(id),
    startedAt: container.startedAt,
    running: true,
    health: "healthy",
    image: {
      classification: GITHUB_POSTGRES_SERVICE_POLICY.imageClassification,
      configuredReference: GITHUB_POSTGRES_SERVICE_POLICY.configuredImage,
      imageIdSha256: sha256(imageId),
      repositoryDigest,
      repositoryDigestSha256: sha256(repositoryDigest),
    },
    publishedPort: {
      hostIpClassifications: publishedHostClassifications,
      hostPort: GITHUB_POSTGRES_SERVICE_POLICY.hostPort,
      containerPort: GITHUB_POSTGRES_SERVICE_POLICY.containerPort,
      protocol: "tcp",
    },
    networks: networkFacts(container.networks),
  });
}

export function databaseTransportRunnerIdentity(environment) {
  if (
    environment.CI !== "true" ||
    environment.GITHUB_ACTIONS !== "true" ||
    environment.RUNNER_ENVIRONMENT !== "github-hosted" ||
    environment.RUNNER_OS !== "Linux"
  ) {
    throw new Error("database transport requires an approved GitHub-hosted Linux runner");
  }
  return {
    environment: "github-hosted",
    os: "Linux",
    runId: required(environment, "GITHUB_RUN_ID", /^\d+$/),
    runAttempt: Number(required(environment, "GITHUB_RUN_ATTEMPT", /^[1-9]\d*$/)),
  };
}

function readAttestation(filePath) {
  const stat = lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o600) {
    throw new Error("database transport attestation is not a mode-0600 physical file");
  }
  const bytes = readFileSync(filePath);
  const value = parseJson(bytes.toString("utf8"), "attestation JSON");
  if (!bytes.equals(canonicalJsonBytes(value))) {
    throw new Error("database transport attestation JSON is not canonical");
  }
  const body = structuredClone(value);
  delete body.evidenceSha256;
  if (
    !isSha256(value.evidenceSha256) ||
    value.evidenceSha256 !== sha256(canonicalJsonBytes(body))
  ) {
    throw new Error("database transport attestation SHA is invalid");
  }
  return { value, fileSha256: sha256(bytes) };
}

function assertAttestationIdentity(value, environment, lifecycleNonce, policy) {
  const runner = databaseTransportRunnerIdentity(environment);
  if (
    !exactKeys(value, [
      "schema", "version", "transportProfile", "runner",
      "lifecycleNonceSha256", "creationNonce", "endpoint", "snapshot",
      "evidenceSha256",
    ]) ||
    value.schema !== DATABASE_TRANSPORT_ATTESTATION_SCHEMA ||
    value.version !== 1 ||
    value.transportProfile !== DATABASE_ADMIN_TRANSPORTS.githubServiceContainer ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      value.creationNonce,
    ) ||
    JSON.stringify(value.runner) !== JSON.stringify(runner) ||
    value.lifecycleNonceSha256 !== sha256(lifecycleNonce) ||
    value.endpoint?.hostClassification !== policy.hostClassification ||
    value.endpoint?.port !== policy.port ||
    value.endpoint?.adminDatabase !== policy.adminDatabase ||
    value.endpoint?.passwordPresent !== true
  ) {
    throw new Error("database transport attestation identity is stale or foreign");
  }
}

export function classifyDatabaseAdminTransport({
  repositoryRoot,
  environment,
  lifecycleProfile,
  lifecycleNonce,
  policy,
  observation,
  commandRunner = defaultCommandRunner,
} = {}) {
  if (new Set(["127.0.0.1", "::1"]).has(observation.serverAddress)) {
    return Object.freeze({
      transportClassification: DATABASE_ADMIN_TRANSPORTS.nativeLoopback,
      serverAddressClassification: "loopback",
      transportAttestationSha256: null,
      transportVerificationStatus: "verified-live",
      imageClassification: null,
      imageRepositoryDigestSha256: null,
    });
  }
  if (
    lifecycleProfile?.classification !==
    STABLE_RUNTIME_SMOKE_DATABASE_CLASSIFICATIONS.lifecycle
  ) {
    throw new Error("database transport non-loopback server is not approved for this profile");
  }
  const filePath = required(
    environment,
    "CERTIFICATION_DATABASE_TRANSPORT_ATTESTATION_PATH",
  );
  if (!policy.url.password) {
    throw new Error("database transport service administrator password is missing");
  }
  const privateRoot = realpathSync(
    required(environment, "CERTIFICATION_WORKTREE_ROOT"),
  );
  const expectedPath = path.join(
    privateRoot,
    DATABASE_TRANSPORT_ATTESTATION_FILE,
  );
  if (
    lstatSync(environment.CERTIFICATION_WORKTREE_ROOT).isSymbolicLink() ||
    path.resolve(filePath) !== expectedPath ||
    realpathSync(path.dirname(filePath)) !== privateRoot
  ) {
    throw new Error("database transport attestation path is not canonical");
  }
  const retained = readAttestation(filePath);
  assertAttestationIdentity(retained.value, environment, lifecycleNonce, policy);
  const live = inspectGithubPostgresServiceContainer({
    repositoryRoot,
    commandRunner,
  });
  if (JSON.stringify(live) !== JSON.stringify(retained.value.snapshot)) {
    throw new Error("database transport live container differs from its attestation");
  }
  const network = live.networks.find(
    (entry) => entry.address === observation.serverAddress,
  );
  if (!network) {
    throw new Error("database transport PostgreSQL server address is not container-owned");
  }
  if (observation.clientAddress && observation.clientAddress !== network.gateway) {
    throw new Error("database transport PostgreSQL client address is not the network gateway");
  }
  if (
    Math.floor(Number(observation.serverVersionNumber) / 10_000) !==
    GITHUB_POSTGRES_SERVICE_POLICY.postgresMajor
  ) {
    throw new Error("database transport PostgreSQL major version is not approved");
  }
  return Object.freeze({
    transportClassification: DATABASE_ADMIN_TRANSPORTS.githubServiceContainer,
    serverAddressClassification: "attested-container-network",
    transportAttestationSha256: retained.fileSha256,
    transportVerificationStatus: "verified-live-attested",
    imageClassification: live.image.classification,
    imageRepositoryDigestSha256: live.image.repositoryDigestSha256,
  });
}
