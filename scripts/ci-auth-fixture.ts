import {
  appendFileSync,
  existsSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import net from "node:net";
import path from "node:path";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import AUTH_RESULT_CONTRACT_OWNER from "./ci-auth-fixture-result-contract.cjs";

import {
  AuthEnvironmentValidationError,
  getAuthEnvOrThrow,
} from "../lib/auth-env";
import { getApplicationEnvironment } from "../lib/config";
import { SYNTHETIC_CI_GOOGLE_DISCOVERY_MARKER } from "../lib/auth-fixture-network";

type AuthResultDestination = Readonly<{
  repositoryRoot: string;
  externalRoot: string;
  resultPath: string;
  sidecarPath: string;
  relativePath: string;
  externalRootIdentitySha256: string;
  resultPathIdentitySha256: string;
}>;

type AuthResultContractModule = Readonly<{
  AUTH_RESULT_SCHEMA: string;
  AUTH_RESULT_VERSION: number;
  AUTH_RESULT_COMPLETION_MARKER: string;
  AUTH_RESULT_ROOT_ENV: string;
  AUTH_RESULT_PATH_ENV: string;
  AUTH_RESULT_NONCE_ENV: string;
  AUTH_RESULT_CANDIDATE_COMMIT_ENV: string;
  AUTH_RESULT_CANDIDATE_TREE_ENV: string;
  commandMode(command: string): Readonly<{ commandId: string; mode: string }>;
  privateValuesFromEnvironment(environment: NodeJS.ProcessEnv): string[];
  resolveAuthResultDestination(options: {
    repositoryRoot: string;
    externalRoot: string | undefined;
    resultPath: string | undefined;
    requireAbsent?: boolean;
    worktreeRoots?: string[];
  }): AuthResultDestination;
  sha256Bytes(value: string | Buffer): string;
  validateAuthCommandResult(options: {
    repositoryRoot: string;
    externalRoot: string;
    resultPath: string;
    expectedNonce: string;
    expectedCommandId: string;
    expectedMode: string;
    expectedCandidateCommitSha?: string;
    expectedCandidateTreeSha?: string;
    sensitiveValues?: string[];
    expectedStreamDescriptors?: Readonly<{
      stdout: StreamDescriptor;
      stderr: StreamDescriptor;
    }>;
    worktreeRoots?: string[];
  }): Readonly<{ result: Record<string, unknown>; destination: AuthResultDestination }>;
  writeAuthCommandResult(options: {
    destination: AuthResultDestination;
    payload: Record<string, unknown>;
  }): Record<string, unknown>;
}>;

// .cjs is the deliberate interoperability boundary between this CommonJS
// ts-node entrypoint and the ESM production-certification harness.
const AUTH_RESULT_CONTRACT =
  AUTH_RESULT_CONTRACT_OWNER as AuthResultContractModule;

type SyntheticCiOAuthFixture = Readonly<{
  googleClientId: string;
  googleClientSecret: string;
}>;

type SyntheticCiOAuthFixturePolicy = Readonly<{
  schema: string;
  provider: string;
  generatedAtRuntime: boolean;
  usesRepositoryOrOrganizationSecrets: boolean;
  externalAuthenticationCapable: boolean;
}>;

type StreamDescriptor = Readonly<{ bytes: number; sha256: string }>;

type SafeFailure = Readonly<{
  code: string;
  category: string;
  message: string;
}>;

type PreflightServerEvidence = {
  commandClassification: string;
  pid: number | null;
  started: boolean;
  closed: boolean;
  exitStatus: number | null;
  signal: NodeJS.Signals | null;
  spawnError: string | null;
  stdout: StreamDescriptor;
  stderr: StreamDescriptor;
  listenerReady: boolean;
  readinessAttemptCount: number;
  readinessStartedAt: string;
  readinessCompletedAt: string | null;
};

type PreflightSessionEvidence = {
  endpointClassification: string;
  method: string;
  statusCode: number | null;
  redirectCount: number;
  redirectClassification: string;
  contentTypeClassification: string;
  bodyBytes: number;
  bodySha256: string;
  safeBodyType: string;
  jsonParseResult: string;
  signedOutValidation: string;
};

type PreflightChecks = {
  providerEndpointContract: string;
  csrfContract: string;
  signOutContract: string;
  googleSignInContract: string;
  inertDiscoveryContract: string;
  nonLoopbackRequestCount: number;
  logSafetyScan: string;
};

export type PreflightCleanupEvidence = {
  sigtermAttempted: boolean;
  sigkillFallbackAttempted: boolean;
  finalServerTermination: string;
  portReleased: boolean;
  taskOwnedCleanup: string;
  completed: boolean;
};

export type PreflightDependencies = Readonly<{
  host?: string;
  port?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  spawnServer?: (executable: string, args: string[], options: object) => ChildProcess;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
  portAvailable?: (host: string, port: number) => Promise<boolean>;
  portReleased?: (host: string, port: number) => Promise<boolean>;
  stopServer?: (server: ChildProcess) => Promise<PreflightCleanupEvidence>;
}>;

class CiAuthCommandError extends Error {
  readonly safeCode: string;
  readonly category: string;

  constructor(safeCode: string, category: string, message: string) {
    super(message);
    this.name = "CiAuthCommandError";
    this.safeCode = safeCode;
    this.category = category;
  }
}

function readFixturePolicy(): SyntheticCiOAuthFixturePolicy {
  const fixturePath = path.join(process.cwd(), "scripts", "ci-auth-fixture.json");
  const parsed = JSON.parse(readFileSync(fixturePath, "utf8")) as Partial<SyntheticCiOAuthFixturePolicy>;
  if (
    parsed.schema !== "interior-ai.synthetic-ci-oauth-fixture-policy.v1" ||
    parsed.provider !== "google" ||
    parsed.generatedAtRuntime !== true ||
    parsed.usesRepositoryOrOrganizationSecrets !== false ||
    parsed.externalAuthenticationCapable !== false
  ) {
    throw new CiAuthCommandError(
      "AUTH_FIXTURE_POLICY_INVALID",
      "fixture-policy",
      "Synthetic CI OAuth fixture policy is missing or malformed",
    );
  }
  return Object.freeze(parsed) as SyntheticCiOAuthFixturePolicy;
}

const SYNTHETIC_CI_OAUTH_FIXTURE_POLICY = readFixturePolicy();

export const CI_AUTH_GITHUB_ENV_ALLOWLIST = Object.freeze([
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "CI_AUTH_FIXTURE_ACTIVE",
] as const);

type CiAuthGitHubEnvironmentKey =
  (typeof CI_AUTH_GITHUB_ENV_ALLOWLIST)[number];

type CiAuthGitHubEnvironmentAssignments = Readonly<
  Record<CiAuthGitHubEnvironmentKey, string>
>;

export type CiAuthFixtureTransportEvent = Readonly<
  | { kind: "mask"; name: CiAuthGitHubEnvironmentKey; value: string }
  | { kind: "github-environment"; assignments: CiAuthGitHubEnvironmentAssignments }
>;

const PREFLIGHT_HOST = "127.0.0.1";
const PREFLIGHT_PORT = 3317;
const PREFLIGHT_TIMEOUT_MS = 120_000;
const EMPTY_SHA256 = AUTH_RESULT_CONTRACT.sha256Bytes("");
const EXPECTED_NEGATIVE_IPC_SCHEMA =
  "interior-ai.ci-auth-fixture-production-misuse-child.v1";

function safeFailure(
  error: unknown,
  fallbackCode = "AUTH_COMMAND_UNEXPECTED_FAILURE",
  fallbackCategory = "unexpected-failure",
): SafeFailure {
  if (error instanceof AuthEnvironmentValidationError) {
    return {
      code: error.safeCode,
      category: error.category,
      message: error.message,
    };
  }
  if (error instanceof CiAuthCommandError) {
    return {
      code: error.safeCode,
      category: error.category,
      message: error.message,
    };
  }
  return {
    code: fallbackCode,
    category: fallbackCategory,
    message: error instanceof Error ? error.message : String(error),
  };
}

function streamDescriptor(value: string | Buffer): StreamDescriptor {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return Object.freeze({
    bytes: bytes.byteLength,
    sha256: AUTH_RESULT_CONTRACT.sha256Bytes(bytes),
  });
}

function safeEnvironmentClassification(environment: NodeJS.ProcessEnv): string {
  try {
    return getApplicationEnvironment(environment) ?? "invalid";
  } catch {
    return "invalid";
  }
}

function environmentNameSetSha256(environment: NodeJS.ProcessEnv): string {
  return AUTH_RESULT_CONTRACT.sha256Bytes(
    Object.keys(environment)
      .filter((name) => environment[name] !== undefined)
      .sort()
      .join("\0"),
  );
}

function assertExplicitFixtureScope(environment: NodeJS.ProcessEnv): void {
  if (environment.CI_AUTH_FIXTURE_MODE !== "1") {
    throw new CiAuthCommandError(
      "SYNTHETIC_AUTH_FIXTURE_MODE_NOT_ENABLED",
      "fixture-activation",
      "Synthetic CI OAuth fixture mode is not explicitly enabled",
    );
  }
  const applicationEnvironment = getApplicationEnvironment(environment);
  if (applicationEnvironment !== "development" && applicationEnvironment !== "staging") {
    throw new CiAuthCommandError(
      applicationEnvironment === "production"
        ? "SYNTHETIC_AUTH_FIXTURE_PRODUCTION_MISUSE_REJECTED"
        : "SYNTHETIC_AUTH_FIXTURE_ENVIRONMENT_INVALID",
      applicationEnvironment === "production"
        ? "production-activation-prohibited"
        : "environment-classification",
      "Synthetic CI OAuth fixture requires an explicit non-production environment",
    );
  }
}

function generateSyntheticFixtureForExport(): SyntheticCiOAuthFixture {
  if (
    !SYNTHETIC_CI_OAUTH_FIXTURE_POLICY.generatedAtRuntime ||
    SYNTHETIC_CI_OAUTH_FIXTURE_POLICY.usesRepositoryOrOrganizationSecrets ||
    SYNTHETIC_CI_OAUTH_FIXTURE_POLICY.externalAuthenticationCapable
  ) {
    throw new CiAuthCommandError(
      "AUTH_FIXTURE_POLICY_GENERATION_PROHIBITED",
      "fixture-policy",
      "Synthetic CI OAuth fixture policy does not permit runtime generation",
    );
  }
  const nonce = randomBytes(16).toString("hex");
  const accountDigits = randomBytes(6).readUIntBE(0, 6).toString().padStart(15, "0");
  return Object.freeze({
    googleClientId: `${accountDigits}-gate-a3-ci-${nonce}.apps.googleusercontent.com`,
    googleClientSecret: `GOCSPX-gate-a3-ci-${nonce}`,
  });
}

function syntheticFixtureMatches(
  googleClientId: string | undefined,
  googleClientSecret: string | undefined,
): boolean {
  const client = googleClientId?.match(
    /^[0-9]+-gate-a3-ci-([a-f0-9]{32})\.apps\.googleusercontent\.com$/i,
  );
  const secret = googleClientSecret?.match(
    /^GOCSPX[-_]gate-a3-ci-([a-f0-9]{32})$/i,
  );
  return Boolean(client && secret && client[1]?.toLowerCase() === secret[1]?.toLowerCase());
}

function fixtureEnvironmentForLocalExecution(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const fixture = generateSyntheticFixtureForExport();
  return {
    ...environment,
    GOOGLE_CLIENT_ID: fixture.googleClientId,
    GOOGLE_CLIENT_SECRET: fixture.googleClientSecret,
    CI_AUTH_FIXTURE_ACTIVE: "1",
  };
}

function localFixtureEnvironment(): NodeJS.ProcessEnv {
  return fixtureEnvironmentForLocalExecution({
    ...process.env,
    APP_ENV: "development",
    CI: "true",
    CI_AUTH_FIXTURE_MODE: "1",
    CI_AUTH_FIXTURE_LOCAL_TEST: "1",
    AUTH_SECRET:
      process.env.AUTH_SECRET ?? "ci-auth-preflight-secret-at-least-32-characters",
    NEXTAUTH_SECRET:
      process.env.NEXTAUTH_SECRET ?? "ci-auth-preflight-secret-at-least-32-characters",
    DATABASE_URL:
      process.env.DATABASE_URL ??
      "postgresql://test:test@127.0.0.1:5432/interior_ai_preflight",
  });
}

export function authPreflightServerEnvironment(
  environment: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  return {
    ...environment,
    NEXT_TELEMETRY_DISABLED: "1",
  };
}

function isPathInside(parentPath: string, candidatePath: string): boolean {
  const relative = path.relative(parentPath, candidatePath);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}

function canonicalGitHubEnvironmentAssignments(
  fixture: SyntheticCiOAuthFixture,
): CiAuthGitHubEnvironmentAssignments {
  return Object.freeze({
    GOOGLE_CLIENT_ID: fixture.googleClientId,
    GOOGLE_CLIENT_SECRET: fixture.googleClientSecret,
    CI_AUTH_FIXTURE_ACTIVE: "1",
  });
}

export function serializeGitHubEnvironmentAssignments(
  assignments: Readonly<Record<string, string>>,
): string {
  const names = Object.keys(assignments);
  if (
    names.length !== CI_AUTH_GITHUB_ENV_ALLOWLIST.length ||
    names.some(
      (name) =>
        !CI_AUTH_GITHUB_ENV_ALLOWLIST.includes(
          name as CiAuthGitHubEnvironmentKey,
        ),
    )
  ) {
    throw new Error("Synthetic CI OAuth fixture export contains a non-allowlisted variable");
  }
  return `${CI_AUTH_GITHUB_ENV_ALLOWLIST.map((name) => {
    if (!/^[A-Z][A-Z0-9_]*$/.test(name)) {
      throw new Error("Synthetic CI OAuth fixture export contains an invalid variable name");
    }
    const value = assignments[name];
    if (typeof value !== "string" || /[\r\n]/.test(value)) {
      throw new Error("Synthetic CI OAuth fixture export values must be single-line strings");
    }
    return `${name}=${value}`;
  }).join("\n")}\n`;
}

export function assertLogSafeFixtureTransportOrder(
  events: ReadonlyArray<CiAuthFixtureTransportEvent>,
): void {
  const maskedValues = new Map<CiAuthGitHubEnvironmentKey, string>();
  let environmentWrites = 0;
  for (const event of events) {
    if (event.kind === "mask") {
      if (!CI_AUTH_GITHUB_ENV_ALLOWLIST.includes(event.name)) {
        throw new Error("Synthetic CI OAuth fixture mask contains a non-allowlisted variable");
      }
      if (event.name === "CI_AUTH_FIXTURE_ACTIVE") {
        throw new Error("Only generated synthetic OAuth values may be masked");
      }
      if (maskedValues.has(event.name)) {
        throw new Error("Synthetic CI OAuth fixture values must be masked exactly once");
      }
      maskedValues.set(event.name, event.value);
      continue;
    }
    environmentWrites += 1;
    if (
      maskedValues.get("GOOGLE_CLIENT_ID") !== event.assignments.GOOGLE_CLIENT_ID ||
      maskedValues.get("GOOGLE_CLIENT_SECRET") !== event.assignments.GOOGLE_CLIENT_SECRET
    ) {
      throw new Error("Synthetic CI OAuth fixture values must be masked before GITHUB_ENV write");
    }
  }
  if (environmentWrites !== 1 || events.at(-1)?.kind !== "github-environment") {
    throw new Error("Synthetic CI OAuth fixture requires one final GITHUB_ENV write");
  }
}

export function exportFixtureToGitHubEnvironment({
  environment = process.env,
  fixtureFactory = generateSyntheticFixtureForExport,
  writeWorkflowCommand = (command: string) => process.stdout.write(`${command}\n`),
  appendEnvironmentFile = (filePath: string, content: string) =>
    appendFileSync(filePath, content, { encoding: "utf8" }),
}: {
  environment?: NodeJS.ProcessEnv;
  fixtureFactory?: () => SyntheticCiOAuthFixture;
  writeWorkflowCommand?: (command: string) => void;
  appendEnvironmentFile?: (filePath: string, content: string) => void;
} = {}): Readonly<Record<string, unknown>> {
  assertExplicitFixtureScope(environment);
  if (environment.CI !== "true" || environment.GITHUB_ACTIONS !== "true") {
    throw new CiAuthCommandError(
      "AUTH_FIXTURE_EXPORT_NOT_GITHUB_CI",
      "fixture-export-scope",
      "Synthetic CI OAuth fixture export requires GitHub Actions CI",
    );
  }
  const githubEnvironmentPath = environment.GITHUB_ENV;
  if (!githubEnvironmentPath || !path.isAbsolute(githubEnvironmentPath)) {
    throw new CiAuthCommandError(
      "AUTH_FIXTURE_GITHUB_ENV_UNAVAILABLE",
      "fixture-export-destination",
      "GitHub Actions environment file is unavailable",
    );
  }
  const githubWorkspacePath = environment.GITHUB_WORKSPACE;
  if (!githubWorkspacePath || !path.isAbsolute(githubWorkspacePath)) {
    throw new CiAuthCommandError(
      "AUTH_FIXTURE_GITHUB_WORKSPACE_UNAVAILABLE",
      "fixture-export-destination",
      "GitHub Actions workspace is unavailable",
    );
  }
  if (!existsSync(githubEnvironmentPath) || !statSync(githubEnvironmentPath).isFile()) {
    throw new CiAuthCommandError(
      "AUTH_FIXTURE_GITHUB_ENV_ABSENT",
      "fixture-export-destination",
      "GitHub Actions environment file is absent",
    );
  }
  if (!existsSync(githubWorkspacePath) || !statSync(githubWorkspacePath).isDirectory()) {
    throw new CiAuthCommandError(
      "AUTH_FIXTURE_GITHUB_WORKSPACE_ABSENT",
      "fixture-export-destination",
      "GitHub Actions workspace is absent",
    );
  }
  const resolvedEnvironmentPath = realpathSync(githubEnvironmentPath);
  const resolvedWorkspacePath = realpathSync(githubWorkspacePath);
  if (isPathInside(resolvedWorkspacePath, resolvedEnvironmentPath)) {
    throw new CiAuthCommandError(
      "AUTH_FIXTURE_GITHUB_ENV_INSIDE_WORKSPACE",
      "fixture-export-destination",
      "GitHub Actions environment file must remain outside GITHUB_WORKSPACE",
    );
  }
  const fixture = fixtureFactory();
  const assignments = canonicalGitHubEnvironmentAssignments(fixture);
  const serializedAssignments = serializeGitHubEnvironmentAssignments(assignments);
  const events: CiAuthFixtureTransportEvent[] = [
    { kind: "mask", name: "GOOGLE_CLIENT_ID", value: fixture.googleClientId },
    { kind: "mask", name: "GOOGLE_CLIENT_SECRET", value: fixture.googleClientSecret },
    { kind: "github-environment", assignments },
  ];
  assertLogSafeFixtureTransportOrder(events);
  for (const event of events) {
    if (event.kind === "mask") {
      writeWorkflowCommand(`::add-mask::${event.value}`);
    } else {
      appendEnvironmentFile(resolvedEnvironmentPath, serializedAssignments);
    }
  }
  console.log("Configured the canonical synthetic CI OAuth fixture.");
  return Object.freeze({
    variableNames: [...CI_AUTH_GITHUB_ENV_ALLOWLIST].sort(),
    providerVariablesPresent: true,
    maskRegistrationCount: 2,
    privateGithubEnvironment: true,
    rawValuesRetained: false,
    completed: true,
  });
}

function authSecretAliasPolicy(environment: NodeJS.ProcessEnv): string {
  const authSecret = environment.AUTH_SECRET?.trim();
  const nextAuthSecret = environment.NEXTAUTH_SECRET?.trim();
  if (authSecret && nextAuthSecret && authSecret !== nextAuthSecret) {
    throw new CiAuthCommandError(
      "AUTH_SECRET_ALIAS_MISMATCH",
      "auth-secret-alias-policy",
      "AUTH_SECRET and NEXTAUTH_SECRET must be equal for certification auth validation",
    );
  }
  if (authSecret && nextAuthSecret) return "dual-equal";
  if (authSecret) return "auth-secret-only";
  if (nextAuthSecret) return "nextauth-secret-only";
  return "missing";
}

export function validateFixtureEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): Readonly<Record<string, unknown>> {
  assertExplicitFixtureScope(environment);
  if (environment.CI !== "true" || environment.GITHUB_ACTIONS !== "true") {
    throw new CiAuthCommandError(
      "AUTH_FIXTURE_VALIDATION_NOT_GITHUB_CI",
      "fixture-validation-scope",
      "Synthetic CI OAuth fixture validation requires GitHub Actions CI",
    );
  }
  const aliasPolicy = authSecretAliasPolicy(environment);
  const authEnvironment = getAuthEnvOrThrow(environment);
  if (
    environment.CI_AUTH_FIXTURE_ACTIVE !== "1" ||
    !syntheticFixtureMatches(
      authEnvironment.googleClientId,
      authEnvironment.googleClientSecret,
    )
  ) {
    throw new CiAuthCommandError(
      "AUTH_FIXTURE_PAIR_COHERENCE_INVALID",
      "provider-pair-coherence",
      "GitHub Actions did not propagate the canonical CI OAuth fixture",
    );
  }
  return Object.freeze({
    providerVariablesPresent: true,
    providerClientIdGrammar: "passed",
    providerPairCoherence: "passed",
    authSecretPresence: "passed",
    aliasPolicy,
    nonProductionClassification: getApplicationEnvironment(environment),
    applicationValidator: "passed",
    networkClassification: "not-used",
    leakScan: "passed",
    completed: true,
  });
}

async function socketUnavailable(host: string, port: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const socket = net.createConnection({ host, port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(true));
  });
}

async function waitForExit(server: ChildProcess, milliseconds: number): Promise<boolean> {
  if (server.exitCode !== null || server.signalCode !== null) return true;
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      once(server, "exit").then(() => true),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), milliseconds);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function stopServerWithEvidence(
  server: ChildProcess,
): Promise<PreflightCleanupEvidence> {
  let sigtermAttempted = false;
  let sigkillFallbackAttempted = false;
  if (server.exitCode === null && server.signalCode === null) {
    sigtermAttempted = true;
    server.kill("SIGTERM");
    if (!(await waitForExit(server, 5_000))) {
      sigkillFallbackAttempted = true;
      server.kill("SIGKILL");
      await waitForExit(server, 5_000);
    }
  }
  const terminated = server.exitCode !== null || server.signalCode !== null;
  return {
    sigtermAttempted,
    sigkillFallbackAttempted,
    finalServerTermination: terminated ? "passed" : "failed",
    portReleased: false,
    taskOwnedCleanup: terminated ? "passed" : "failed",
    completed: true,
  };
}

function requireRecord(value: unknown, description: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CiAuthCommandError(
      "AUTH_PREFLIGHT_RESPONSE_SHAPE_INVALID",
      "response-shape",
      `Advisory auth ${description} response has an unexpected shape`,
    );
  }
  return value as Record<string, unknown>;
}

async function fetchAuthJson(
  fetchImpl: typeof fetch,
  authUrl: string,
  pathName: string,
  init?: RequestInit,
): Promise<{ payload: unknown; response: Response }> {
  const response = await fetchImpl(`${authUrl}/${pathName}`, init);
  const contentType = response.headers.get("content-type") ?? "";
  if (response.status !== 200 || !contentType.toLowerCase().includes("application/json")) {
    throw new CiAuthCommandError(
      "AUTH_PREFLIGHT_INTERACTION_RESPONSE_INVALID",
      "auth-interaction-response",
      `Advisory auth ${pathName} endpoint did not return structured JSON`,
    );
  }
  try {
    return { payload: JSON.parse(await response.text()) as unknown, response };
  } catch {
    throw new CiAuthCommandError(
      "AUTH_PREFLIGHT_INTERACTION_JSON_INVALID",
      "auth-interaction-response",
      `Advisory auth ${pathName} endpoint returned HTML or malformed JSON`,
    );
  }
}

async function assertAuthInteractionCompatibility(
  fetchImpl: typeof fetch,
  authUrl: string,
  expectedGoogleClientId: string,
  checks: PreflightChecks,
): Promise<void> {
  const { payload: providersPayload } = await fetchAuthJson(
    fetchImpl,
    authUrl,
    "providers",
  );
  const providers = requireRecord(providersPayload, "providers");
  const google = requireRecord(providers.google, "Google provider");
  const signInUrl = new URL(String(google.signinUrl));
  const callbackUrl = new URL(String(google.callbackUrl));
  if (
    google.id !== "google" ||
    signInUrl.pathname !== "/api/auth/signin/google" ||
    callbackUrl.pathname !== "/api/auth/callback/google" ||
    signInUrl.origin !== callbackUrl.origin
  ) {
    throw new CiAuthCommandError(
      "AUTH_PREFLIGHT_PROVIDER_CONTRACT_INVALID",
      "provider-endpoint-contract",
      "Advisory auth Google provider routes changed unexpectedly",
    );
  }
  checks.providerEndpointContract = "passed";

  const { payload: csrfPayload, response: csrfResponse } = await fetchAuthJson(
    fetchImpl,
    authUrl,
    "csrf",
  );
  const csrfToken = requireRecord(csrfPayload, "CSRF").csrfToken;
  if (typeof csrfToken !== "string" || csrfToken.length < 32) {
    throw new CiAuthCommandError(
      "AUTH_PREFLIGHT_CSRF_CONTRACT_INVALID",
      "csrf-contract",
      "Advisory auth CSRF response did not contain a valid token",
    );
  }
  const cookie = csrfResponse.headers
    .getSetCookie()
    .map((value) => value.split(";", 1)[0])
    .join("; ");
  if (!cookie.includes("authjs.csrf-token=")) {
    throw new CiAuthCommandError(
      "AUTH_PREFLIGHT_CSRF_COOKIE_INVALID",
      "csrf-contract",
      "Advisory auth CSRF cookie was not issued",
    );
  }
  checks.csrfContract = "passed";

  const requestHeaders = {
    Cookie: cookie,
    "Content-Type": "application/x-www-form-urlencoded",
    "X-Auth-Return-Redirect": "1",
  };
  const { payload: signOutPayload } = await fetchAuthJson(
    fetchImpl,
    authUrl,
    "signout",
    {
      method: "POST",
      headers: requestHeaders,
      body: new URLSearchParams({ csrfToken }),
      redirect: "manual",
    },
  );
  const signOutUrl = new URL(String(requireRecord(signOutPayload, "sign-out").url));
  if (signOutUrl.origin !== signInUrl.origin || signOutUrl.pathname !== "/") {
    throw new CiAuthCommandError(
      "AUTH_PREFLIGHT_SIGN_OUT_CONTRACT_INVALID",
      "sign-out-contract",
      "Advisory auth sign-out redirect changed unexpectedly",
    );
  }
  checks.signOutContract = "passed";

  const { payload: signInPayload } = await fetchAuthJson(
    fetchImpl,
    authUrl,
    "signin/google",
    {
      method: "POST",
      headers: requestHeaders,
      body: new URLSearchParams({
        csrfToken,
        callbackUrl: new URL("/design", signInUrl.origin).href,
      }),
      redirect: "manual",
    },
  );
  const authorizationUrl = new URL(String(requireRecord(signInPayload, "sign-in").url));
  if (
    authorizationUrl.protocol !== "https:" ||
    authorizationUrl.hostname !== "accounts.google.com" ||
    authorizationUrl.searchParams.get("client_id") !== expectedGoogleClientId ||
    authorizationUrl.searchParams.get("redirect_uri") !== callbackUrl.href ||
    authorizationUrl.searchParams.get("response_type") !== "code" ||
    !authorizationUrl.searchParams.get("code_challenge")
  ) {
    throw new CiAuthCommandError(
      "AUTH_PREFLIGHT_GOOGLE_SIGN_IN_CONTRACT_INVALID",
      "google-sign-in-contract",
      "Advisory auth Google authorization redirect changed unexpectedly",
    );
  }
  checks.googleSignInContract = "passed";
}

function responseBodyType(contentType: string, body: string): {
  safeBodyType: string;
  parseResult: string;
  payload: unknown;
} {
  if (body.length === 0) {
    return { safeBodyType: "empty", parseResult: "failed", payload: undefined };
  }
  if (contentType.toLowerCase().includes("text/html") || /^\s*</.test(body)) {
    return { safeBodyType: "HTML", parseResult: "failed", payload: undefined };
  }
  try {
    const payload = JSON.parse(body) as unknown;
    return {
      safeBodyType:
        payload === null
          ? "null"
          : Array.isArray(payload)
            ? "array"
            : typeof payload === "object"
              ? "object"
              : "scalar",
      parseResult: "passed",
      payload,
    };
  } catch {
    return {
      safeBodyType: contentType.toLowerCase().includes("application/json")
        ? "malformed"
        : "text",
      parseResult: "failed",
      payload: undefined,
    };
  }
}

function failureEvidence(
  failure: SafeFailure,
  stdout: string | Buffer = "",
  stderr: string | Buffer = `${failure.message}\n`,
  child: Readonly<{ exitStatus: number | null; signal: string | null; spawnError: string | null }> = {
    exitStatus: null,
    signal: null,
    spawnError: null,
  },
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    code: failure.code,
    category: failure.category,
    stdout: streamDescriptor(stdout),
    stderr: streamDescriptor(stderr),
    child,
    completed: true,
  });
}

export async function preflightAuthSession(
  environment: NodeJS.ProcessEnv,
  dependencies: PreflightDependencies = {},
): Promise<Readonly<{
  result: "success" | "failure";
  evidence: Readonly<Record<string, unknown>>;
  failure: SafeFailure | null;
}>> {
  const host = dependencies.host ?? PREFLIGHT_HOST;
  const port = dependencies.port ?? PREFLIGHT_PORT;
  const timeoutMs = dependencies.timeoutMs ?? PREFLIGHT_TIMEOUT_MS;
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const spawnServer = dependencies.spawnServer ?? spawn;
  const sleep = dependencies.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const now = dependencies.now ?? Date.now;
  const portAvailable = dependencies.portAvailable ?? socketUnavailable;
  const portReleased = dependencies.portReleased ?? socketUnavailable;
  const stopServer = dependencies.stopServer ?? stopServerWithEvidence;
  const authUrl = `http://${host}:${port}/api/auth`;
  const sessionUrl = `${authUrl}/session`;
  const startedAt = new Date(now()).toISOString();
  const serverEvidence: PreflightServerEvidence = {
    commandClassification: "next-dev-webpack-loopback",
    pid: null,
    started: false,
    closed: false,
    exitStatus: null,
    signal: null,
    spawnError: null,
    stdout: streamDescriptor(""),
    stderr: streamDescriptor(""),
    listenerReady: false,
    readinessAttemptCount: 0,
    readinessStartedAt: startedAt,
    readinessCompletedAt: null,
  };
  const sessionEvidence: PreflightSessionEvidence = {
    endpointClassification: "loopback-auth-session",
    method: "GET",
    statusCode: null,
    redirectCount: 0,
    redirectClassification: "not-observed",
    contentTypeClassification: "not-observed",
    bodyBytes: 0,
    bodySha256: EMPTY_SHA256,
    safeBodyType: "empty",
    jsonParseResult: "not-attempted",
    signedOutValidation: "not-attempted",
  };
  const checks: PreflightChecks = {
    providerEndpointContract: "not-attempted",
    csrfContract: "not-attempted",
    signOutContract: "not-attempted",
    googleSignInContract: "not-attempted",
    inertDiscoveryContract: "not-attempted",
    nonLoopbackRequestCount: 0,
    logSafetyScan: "not-attempted",
  };
  let cleanup: PreflightCleanupEvidence = {
    sigtermAttempted: false,
    sigkillFallbackAttempted: false,
    finalServerTermination: "not-started",
    portReleased: true,
    taskOwnedCleanup: "not-required",
    completed: true,
  };
  let server: ChildProcess | null = null;
  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  let earliestFailure: SafeFailure | null = null;
  let authEnvironment: ReturnType<typeof getAuthEnvOrThrow> | null = null;

  const retainFailure = (error: unknown, code?: string, category?: string): void => {
    if (!earliestFailure) earliestFailure = safeFailure(error, code, category);
  };

  try {
    assertExplicitFixtureScope(environment);
    authEnvironment = getAuthEnvOrThrow(environment);
    if (
      environment.CI_AUTH_FIXTURE_ACTIVE !== "1" ||
      !syntheticFixtureMatches(
        authEnvironment.googleClientId,
        authEnvironment.googleClientSecret,
      )
    ) {
      throw new CiAuthCommandError(
        "AUTH_PREFLIGHT_FIXTURE_INVALID",
        "provider-pair-coherence",
        "Advisory auth preflight did not receive the canonical CI OAuth fixture",
      );
    }
    if (!(await portAvailable(host, port))) {
      throw new CiAuthCommandError(
        "AUTH_PREFLIGHT_PORT_UNAVAILABLE",
        "server-preflight",
        "Advisory auth preflight port is already in use",
      );
    }

    const nextExecutable = path.join(
      process.cwd(),
      "node_modules",
      ".bin",
      process.platform === "win32" ? "next.cmd" : "next",
    );
    server = spawnServer(
      nextExecutable,
      ["dev", "--webpack", "--hostname", host, "--port", String(port)],
      {
        cwd: process.cwd(),
        env: authPreflightServerEnvironment(environment),
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    serverEvidence.started = true;
    serverEvidence.pid = Number.isSafeInteger(server.pid) ? server.pid ?? null : null;
    server.stdout?.on("data", (chunk: Buffer | string) => stdoutChunks.push(Buffer.from(chunk)));
    server.stderr?.on("data", (chunk: Buffer | string) => stderrChunks.push(Buffer.from(chunk)));
    server.once("error", (error: NodeJS.ErrnoException) => {
      serverEvidence.spawnError = error.code ?? "SPAWN_ERROR";
      retainFailure(
        new CiAuthCommandError(
          "AUTH_PREFLIGHT_SERVER_SPAWN_FAILED",
          "server-spawn",
          "Advisory auth preflight server could not be spawned",
        ),
      );
    });

    const deadline = now() + timeoutMs;
    let response: Response | null = null;
    while (now() < deadline) {
      if (server.exitCode !== null || server.signalCode !== null) {
        throw new CiAuthCommandError(
          "AUTH_PREFLIGHT_SERVER_EXITED_BEFORE_LISTENER",
          "server-readiness",
          "Advisory auth preflight server exited before the listener became ready",
        );
      }
      serverEvidence.readinessAttemptCount += 1;
      try {
        response = await fetchImpl(sessionUrl, {
          headers: { Accept: "application/json" },
          redirect: "manual",
        });
        serverEvidence.listenerReady = true;
        serverEvidence.readinessCompletedAt = new Date(now()).toISOString();
        break;
      } catch {
        await sleep(500);
      }
    }
    if (!response) {
      throw new CiAuthCommandError(
        "AUTH_PREFLIGHT_READINESS_FAILED",
        "server-readiness",
        "Advisory auth preflight server did not become ready",
      );
    }

    sessionEvidence.statusCode = response.status;
    const redirect = response.status >= 300 && response.status < 400;
    sessionEvidence.redirectCount = redirect || response.redirected ? 1 : 0;
    sessionEvidence.redirectClassification =
      sessionEvidence.redirectCount === 0 ? "none" : "http-redirect-rejected";
    const contentType = response.headers.get("content-type") ?? "";
    sessionEvidence.contentTypeClassification = contentType
      .toLowerCase()
      .includes("application/json")
      ? "application-json"
      : contentType.toLowerCase().includes("text/html")
        ? "html"
        : contentType
          ? "other"
          : "missing";
    const responseText = await response.text();
    const responseBytes = Buffer.from(responseText);
    sessionEvidence.bodyBytes = responseBytes.byteLength;
    sessionEvidence.bodySha256 = AUTH_RESULT_CONTRACT.sha256Bytes(responseBytes);
    const body = responseBodyType(contentType, responseText);
    sessionEvidence.safeBodyType = body.safeBodyType;
    sessionEvidence.jsonParseResult = body.parseResult;

    if (sessionEvidence.redirectCount !== 0) {
      throw new CiAuthCommandError(
        "AUTH_PREFLIGHT_SESSION_REDIRECT_REJECTED",
        "session-response",
        "Advisory auth session endpoint redirected instead of returning canonical JSON",
      );
    }
    if (response.status !== 200) {
      throw new CiAuthCommandError(
        response.status === 404
          ? "AUTH_PREFLIGHT_SESSION_ENDPOINT_NOT_FOUND"
          : "AUTH_PREFLIGHT_SESSION_STATUS_INVALID",
        "session-response",
        "Advisory auth session endpoint did not return HTTP 200",
      );
    }
    if (sessionEvidence.contentTypeClassification !== "application-json") {
      throw new CiAuthCommandError(
        "AUTH_PREFLIGHT_SESSION_CONTENT_TYPE_INVALID",
        "session-response",
        "Advisory auth session endpoint did not return structured JSON",
      );
    }
    if (body.parseResult !== "passed") {
      throw new CiAuthCommandError(
        "AUTH_PREFLIGHT_SESSION_JSON_INVALID",
        "session-response",
        "Advisory auth session endpoint returned an HTML or malformed response",
      );
    }
    if (body.payload !== null && (typeof body.payload !== "object" || Array.isArray(body.payload))) {
      throw new CiAuthCommandError(
        "AUTH_PREFLIGHT_SESSION_SHAPE_INVALID",
        "session-response",
        "Advisory auth session endpoint returned an unexpected JSON shape",
      );
    }
    sessionEvidence.signedOutValidation = "passed";

    await assertAuthInteractionCompatibility(
      fetchImpl,
      authUrl,
      authEnvironment.googleClientId,
      checks,
    );
    const serverOutput = Buffer.concat([...stdoutChunks, ...stderrChunks]).toString("utf8");
    const inertDiscoveryCount = serverOutput.split(
      SYNTHETIC_CI_GOOGLE_DISCOVERY_MARKER,
    ).length - 1;
    if (inertDiscoveryCount !== 1) {
      throw new CiAuthCommandError(
        "AUTH_PREFLIGHT_INERT_DISCOVERY_INVALID",
        "inert-discovery-contract",
        "Advisory auth preflight did not prove exactly one inert Google discovery",
      );
    }
    checks.inertDiscoveryContract = "passed";
    if (
      serverOutput.includes(authEnvironment.googleClientId) ||
      serverOutput.includes(authEnvironment.googleClientSecret) ||
      serverOutput.includes(authEnvironment.authSecret)
    ) {
      throw new CiAuthCommandError(
        "AUTH_PREFLIGHT_LOG_LEAK_DETECTED",
        "log-safety",
        "Advisory auth preflight detected raw private value leakage",
      );
    }
    if (/ClientFetchError|Unexpected token\s+['"]?</.test(serverOutput)) {
      throw new CiAuthCommandError(
        "AUTH_PREFLIGHT_CLIENT_HTML_ERROR",
        "log-safety",
        "Advisory auth preflight detected auth-client-html-error",
      );
    }
    if (/auth module initialization|Missing required environment variable/.test(serverOutput)) {
      throw new CiAuthCommandError(
        "AUTH_PREFLIGHT_AUTH_INITIALIZATION_ERROR",
        "log-safety",
        "Advisory auth preflight detected auth-initialization-error",
      );
    }
    checks.logSafetyScan = "passed";
  } catch (error) {
    retainFailure(error);
  } finally {
    if (server) {
      try {
        cleanup = await stopServer(server);
      } catch (error) {
        cleanup = {
          sigtermAttempted: true,
          sigkillFallbackAttempted: false,
          finalServerTermination: "failed",
          portReleased: false,
          taskOwnedCleanup: "failed",
          completed: true,
        };
        retainFailure(
          error,
          "AUTH_PREFLIGHT_CLEANUP_FAILED",
          "server-cleanup",
        );
      }
      cleanup.portReleased = await portReleased(host, port);
      if (!cleanup.portReleased || cleanup.finalServerTermination !== "passed") {
        cleanup.taskOwnedCleanup = "failed";
        retainFailure(
          new CiAuthCommandError(
            "AUTH_PREFLIGHT_CLEANUP_FAILED",
            "server-cleanup",
            "Advisory auth preflight did not terminate its server and release the port",
          ),
        );
      }
      serverEvidence.closed = cleanup.finalServerTermination === "passed";
      serverEvidence.exitStatus = server.exitCode;
      serverEvidence.signal = server.signalCode;
    }
    serverEvidence.stdout = streamDescriptor(Buffer.concat(stdoutChunks));
    serverEvidence.stderr = streamDescriptor(Buffer.concat(stderrChunks));
    if (!serverEvidence.readinessCompletedAt && serverEvidence.readinessAttemptCount > 0) {
      serverEvidence.readinessCompletedAt = new Date(now()).toISOString();
    }
  }

  const evidence = Object.freeze({
    invocation: Object.freeze({}),
    server: Object.freeze({ ...serverEvidence }),
    sessionRequest: Object.freeze({ ...sessionEvidence }),
    checks: Object.freeze({ ...checks }),
    cleanup: Object.freeze({ ...cleanup }),
  });
  return Object.freeze({
    result: earliestFailure ? "failure" : "success",
    evidence,
    failure: earliestFailure,
  });
}

type PreflightOutcome = Readonly<{
  result: "success" | "failure";
  evidence: Readonly<Record<string, unknown>>;
  failure: SafeFailure | null;
}>;

function prepareResultContext(command: string, environment: NodeJS.ProcessEnv): Readonly<{
  command: string;
  commandIdentity: Readonly<{ commandId: string; mode: string }>;
  destination: AuthResultDestination;
  nonce: string;
  startedAt: string;
  identity: Readonly<Record<string, unknown>>;
}> {
  const commandIdentity = AUTH_RESULT_CONTRACT.commandMode(command);
  const rootName = AUTH_RESULT_CONTRACT.AUTH_RESULT_ROOT_ENV;
  const pathName = AUTH_RESULT_CONTRACT.AUTH_RESULT_PATH_ENV;
  const nonceName = AUTH_RESULT_CONTRACT.AUTH_RESULT_NONCE_ENV;
  const destination = AUTH_RESULT_CONTRACT.resolveAuthResultDestination({
    repositoryRoot: process.cwd(),
    externalRoot: environment[rootName],
    resultPath: environment[pathName],
  });
  const nonce = environment[nonceName];
  if (!nonce) {
    throw new Error("Auth result invocation nonce is required");
  }
  const candidateCommit = environment[AUTH_RESULT_CONTRACT.AUTH_RESULT_CANDIDATE_COMMIT_ENV];
  const candidateTree = environment[AUTH_RESULT_CONTRACT.AUTH_RESULT_CANDIDATE_TREE_ENV];
  if (Boolean(candidateCommit) !== Boolean(candidateTree)) {
    throw new Error("Auth result candidate commit and tree must be supplied together");
  }
  const fixturePath = path.join(process.cwd(), "scripts", "ci-auth-fixture.json");
  const validatorPath = path.join(process.cwd(), "lib", "auth-env.ts");
  const startedAt = new Date().toISOString();
  return Object.freeze({
    command,
    commandIdentity,
    destination,
    nonce,
    startedAt,
    identity: Object.freeze({
      candidateCommitSha: candidateCommit ?? null,
      candidateTreeSha: candidateTree ?? null,
      invocationNonce: nonce,
      fixturePolicy: Object.freeze({
        schema: SYNTHETIC_CI_OAUTH_FIXTURE_POLICY.schema,
        sha256: AUTH_RESULT_CONTRACT.sha256Bytes(readFileSync(fixturePath)),
      }),
      authValidator: Object.freeze({
        owner: "lib/auth-env.ts",
        sha256: AUTH_RESULT_CONTRACT.sha256Bytes(readFileSync(validatorPath)),
      }),
      environmentNameSetSha256: environmentNameSetSha256(environment),
      environmentClassification: safeEnvironmentClassification(environment),
      externalRootIdentitySha256: destination.externalRootIdentitySha256,
      resultPathIdentitySha256: destination.resultPathIdentitySha256,
      startedAt,
    }),
  });
}

function writeStructuredResult(
  context: ReturnType<typeof prepareResultContext>,
  environment: NodeJS.ProcessEnv,
  result: "success" | "expected-negative-pass" | "failure",
  evidence: Readonly<Record<string, unknown>>,
  failure: Readonly<Record<string, unknown>> | null,
  expectedStreamDescriptors?: Readonly<{
    stdout: StreamDescriptor;
    stderr: StreamDescriptor;
  }>,
): Record<string, unknown> {
  const completedAt = new Date().toISOString();
  const payload = {
    schema: AUTH_RESULT_CONTRACT.AUTH_RESULT_SCHEMA,
    version: AUTH_RESULT_CONTRACT.AUTH_RESULT_VERSION,
    command: {
      id: context.commandIdentity.commandId,
      mode: context.commandIdentity.mode,
      executable: "node-ts-node",
      argv: ["scripts/ci-auth-fixture.ts", context.command],
    },
    result,
    valid: result !== "failure",
    identity: { ...context.identity, completedAt },
    evidence,
    failure,
    completion: {
      complete: true,
      marker: AUTH_RESULT_CONTRACT.AUTH_RESULT_COMPLETION_MARKER,
    },
  };
  const written = AUTH_RESULT_CONTRACT.writeAuthCommandResult({
    destination: context.destination,
    payload,
  });
  AUTH_RESULT_CONTRACT.validateAuthCommandResult({
    repositoryRoot: process.cwd(),
    externalRoot: context.destination.externalRoot,
    resultPath: context.destination.resultPath,
    expectedNonce: context.nonce,
    expectedCommandId: context.commandIdentity.commandId,
    expectedMode: context.commandIdentity.mode,
    expectedCandidateCommitSha:
      environment[AUTH_RESULT_CONTRACT.AUTH_RESULT_CANDIDATE_COMMIT_ENV],
    expectedCandidateTreeSha:
      environment[AUTH_RESULT_CONTRACT.AUTH_RESULT_CANDIDATE_TREE_ENV],
    sensitiveValues: AUTH_RESULT_CONTRACT.privateValuesFromEnvironment(environment),
    expectedStreamDescriptors,
  });
  return written;
}

function validationFailureEvidence(failure: SafeFailure): Readonly<Record<string, unknown>> {
  return Object.freeze({
    providerVariablesPresent: !new Set([
      "AUTH_PROVIDER_VARIABLE_MISSING",
      "AUTH_PROVIDER_VARIABLE_EMPTY",
    ]).has(failure.code),
    providerClientIdGrammar:
      failure.code === "AUTH_PROVIDER_CLIENT_ID_GRAMMAR_INVALID" ? "failed" : "not-completed",
    providerPairCoherence:
      failure.code === "AUTH_FIXTURE_PAIR_COHERENCE_INVALID" ? "failed" : "not-completed",
    authSecretPresence:
      failure.code === "AUTH_SECRET_MISSING" || failure.code === "AUTH_SECRET_EMPTY"
        ? "failed"
        : "not-completed",
    aliasPolicy:
      failure.code === "AUTH_SECRET_ALIAS_MISMATCH" ? "mismatch-rejected" : "not-completed",
    nonProductionClassification: "not-completed",
    applicationValidator: "failed",
    networkClassification: "not-used",
    leakScan: "passed",
    completed: true,
  });
}

function persistPreflightOutcomeWithContext(
  command: "preflight" | "preflight-local",
  environment: NodeJS.ProcessEnv,
  context: ReturnType<typeof prepareResultContext>,
  outcome: PreflightOutcome,
): Record<string, unknown> {
  const invocation = {
    packageCommandId: context.commandIdentity.commandId,
    executableClassification: "node-ts-node",
    argvIdentitySha256: AUTH_RESULT_CONTRACT.sha256Bytes(
      `scripts/ci-auth-fixture.ts\0${command}`,
    ),
    fixturePolicySha256: (context.identity.fixturePolicy as { sha256: string }).sha256,
    authValidatorSha256: (context.identity.authValidator as { sha256: string }).sha256,
    environmentNameSetSha256: environmentNameSetSha256(environment),
    resultPathIdentitySha256: context.destination.resultPathIdentitySha256,
    invocationNonce: context.nonce,
  };
  const evidence: Readonly<Record<string, unknown>> = {
    ...outcome.evidence,
    invocation,
  };
  const serverEvidence = evidence.server as PreflightServerEvidence;
  const stderr = outcome.failure ? `${outcome.failure.message}\n` : "";
  return writeStructuredResult(
    context,
    environment,
    outcome.result,
    evidence,
    outcome.failure
      ? failureEvidence(outcome.failure, "", stderr, {
          exitStatus: serverEvidence.exitStatus,
          signal: serverEvidence.signal,
          spawnError: serverEvidence.spawnError,
        })
      : null,
  );
}

export function persistPreflightOutcome(
  command: "preflight" | "preflight-local",
  environment: NodeJS.ProcessEnv,
  outcome: PreflightOutcome,
): Record<string, unknown> {
  return persistPreflightOutcomeWithContext(
    command,
    environment,
    prepareResultContext(command, environment),
    outcome,
  );
}

async function runProductionMisuseChild(
  environment: NodeJS.ProcessEnv,
): Promise<void> {
  try {
    getAuthEnvOrThrow(environment);
  } catch (error) {
    const failure = safeFailure(error);
    if (process.send) {
      await new Promise<void>((resolve) =>
        process.send?.(
          {
            schema: EXPECTED_NEGATIVE_IPC_SCHEMA,
            safeFailureCode: failure.code,
            category: failure.category,
            syntheticFixtureUse: true,
            productionActivationProhibited:
              failure.code === "SYNTHETIC_AUTH_FIXTURE_PRODUCTION_MISUSE_REJECTED",
          },
          () => resolve(),
        ),
      );
    }
    console.error(failure.message);
    process.exitCode = 1;
    return;
  }
  console.error("Synthetic production fixture was unexpectedly accepted");
  process.exitCode = 2;
}

export type ProductionChildOutcome = Readonly<{
  status: number | null;
  signal: NodeJS.Signals | null;
  spawnError: string | null;
  stdout: Buffer;
  stderr: Buffer;
  message: Record<string, unknown> | null;
}>;

async function spawnProductionMisuseChild(
  environment: NodeJS.ProcessEnv,
): Promise<ProductionChildOutcome> {
  return new Promise((resolve) => {
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let childMessage: Record<string, unknown> | null = null;
    let spawnError: string | null = null;
    const child = spawn(
      process.execPath,
      [
        "-r",
        require.resolve("ts-node/register/transpile-only"),
        "-r",
        require.resolve("tsconfig-paths/register"),
        path.join(process.cwd(), "scripts", "ci-auth-fixture.ts"),
        "production-misuse-child",
      ],
      {
        cwd: process.cwd(),
        env: {
          ...environment,
          TS_NODE_COMPILER_OPTIONS: JSON.stringify({
            module: "CommonJS",
            moduleResolution: "node",
          }),
        },
        stdio: ["ignore", "pipe", "pipe", "ipc"],
      },
    );
    child.stdout?.on("data", (chunk: Buffer | string) => stdout.push(Buffer.from(chunk)));
    child.stderr?.on("data", (chunk: Buffer | string) => stderr.push(Buffer.from(chunk)));
    child.on("message", (message) => {
      if (message && typeof message === "object" && !Array.isArray(message)) {
        childMessage = message as Record<string, unknown>;
      }
    });
    child.once("error", (error: NodeJS.ErrnoException) => {
      spawnError = error.code ?? "SPAWN_ERROR";
    });
    child.once("close", (status, signal) => {
      resolve({
        status,
        signal,
        spawnError,
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr),
        message: childMessage,
      });
    });
  });
}

export function productionMisuseEvidence(
  child: ProductionChildOutcome,
  sensitiveValues: string[],
): Readonly<{
  result: "expected-negative-pass" | "failure";
  evidence: Readonly<Record<string, unknown>>;
  failure: SafeFailure | null;
}> {
  const message = child.message;
  const intended =
    child.status === 1 &&
    child.signal === null &&
    child.spawnError === null &&
    message?.schema === EXPECTED_NEGATIVE_IPC_SCHEMA &&
    message.safeFailureCode ===
      "SYNTHETIC_AUTH_FIXTURE_PRODUCTION_MISUSE_REJECTED" &&
    message.category === "production-activation-prohibited" &&
    message.syntheticFixtureUse === true &&
    message.productionActivationProhibited === true;
  const streams = Buffer.concat([child.stdout, child.stderr]).toString("utf8");
  const leakFree = sensitiveValues.every((value) => !value || !streams.includes(value));
  const excludedFailureCauses = {
    missingDependency: intended,
    loaderFailure: intended,
    syntaxError: intended,
    transportFailure: intended,
    missingInput: intended,
    databaseFailure: intended,
  };
  const evidence = Object.freeze({
    expectedNegativeClassification: intended
      ? "intended-production-rejection"
      : "intended-rejection-not-proved",
    child: Object.freeze({
      exitStatus: child.status,
      signal: child.signal,
      spawnError: child.spawnError,
    }),
    safeFailureCode:
      typeof message?.safeFailureCode === "string"
        ? message.safeFailureCode
        : "AUTH_PRODUCTION_MISUSE_UNCLASSIFIED_CHILD_FAILURE",
    intendedRejectionProved: intended,
    syntheticFixtureUseProved: message?.syntheticFixtureUse === true,
    productionActivationProhibitedProved:
      message?.productionActivationProhibited === true,
    excludedFailureCauses: Object.freeze(excludedFailureCauses),
    stdout: streamDescriptor(child.stdout),
    stderr: streamDescriptor(child.stderr),
    rawValueLeakScan: leakFree ? "passed" : "failed",
    completed: true,
  });
  return Object.freeze({
    result: intended && leakFree ? "expected-negative-pass" : "failure",
    evidence,
    failure:
      intended && leakFree
        ? null
        : {
            code: leakFree
              ? "AUTH_PRODUCTION_MISUSE_INTENDED_REJECTION_NOT_PROVED"
              : "AUTH_PRODUCTION_MISUSE_STREAM_LEAK_DETECTED",
            category: leakFree ? "expected-negative-proof" : "log-safety",
            message: leakFree
              ? "Production misuse child did not prove the intended rejection"
              : "Production misuse child streams contained a raw private value",
          },
  });
}

async function executeStructuredCommand(command: string): Promise<void> {
  const parentEnvironment = process.env;
  AUTH_RESULT_CONTRACT.resolveAuthResultDestination({
    repositoryRoot: process.cwd(),
    externalRoot: parentEnvironment[AUTH_RESULT_CONTRACT.AUTH_RESULT_ROOT_ENV],
    resultPath: parentEnvironment[AUTH_RESULT_CONTRACT.AUTH_RESULT_PATH_ENV],
  });
  const environment =
    command === "production-misuse"
      ? fixtureEnvironmentForLocalExecution({
          ...parentEnvironment,
          APP_ENV: "production",
          CI: "true",
          GITHUB_ACTIONS: "true",
          CI_AUTH_FIXTURE_MODE: "1",
          AUTH_SECRET: "ci-auth-production-misuse-secret-at-least-32-characters",
          NEXTAUTH_SECRET: "ci-auth-production-misuse-secret-at-least-32-characters",
        })
      : command === "preflight-local"
        ? localFixtureEnvironment()
        : parentEnvironment;
  const context = prepareResultContext(command, environment);
  if (command === "export-github-env") {
    try {
      const evidence = exportFixtureToGitHubEnvironment({ environment });
      writeStructuredResult(context, environment, "success", evidence, null);
    } catch (error) {
      const failure = safeFailure(error);
      const stderr = `${failure.message}\n`;
      const evidence = {
        variableNames: [...CI_AUTH_GITHUB_ENV_ALLOWLIST].sort(),
        providerVariablesPresent: false,
        maskRegistrationCount: 0,
        privateGithubEnvironment: false,
        rawValuesRetained: false,
        completed: false,
      };
      writeStructuredResult(
        context,
        environment,
        "failure",
        evidence,
        failureEvidence(failure, "", stderr),
      );
      process.stderr.write(stderr);
      process.exitCode = 1;
    }
    return;
  }
  if (command === "validate-env") {
    try {
      const evidence = validateFixtureEnvironment(environment);
      const stdout = "Validated the canonical synthetic CI OAuth fixture.\n";
      writeStructuredResult(context, environment, "success", evidence, null);
      process.stdout.write(stdout);
    } catch (error) {
      const failure = safeFailure(error);
      const stderr = `${failure.message}\n`;
      writeStructuredResult(
        context,
        environment,
        "failure",
        validationFailureEvidence(failure),
        failureEvidence(failure, "", stderr),
      );
      process.stderr.write(stderr);
      process.exitCode = 1;
    }
    return;
  }
  if (command === "production-misuse") {
    const child = await spawnProductionMisuseChild(environment);
    const outcome = productionMisuseEvidence(
      child,
      AUTH_RESULT_CONTRACT.privateValuesFromEnvironment(environment),
    );
    const failureRecord = outcome.failure
      ? failureEvidence(outcome.failure, child.stdout, child.stderr, {
          exitStatus: child.status,
          signal: child.signal,
          spawnError: child.spawnError,
        })
      : null;
    writeStructuredResult(
      context,
      environment,
      outcome.result,
      outcome.evidence,
      failureRecord,
      {
        stdout: streamDescriptor(child.stdout),
        stderr: streamDescriptor(child.stderr),
      },
    );
    if (child.stdout.byteLength > 0) process.stdout.write(child.stdout);
    if (child.stderr.byteLength > 0) process.stderr.write(child.stderr);
    if (outcome.result === "expected-negative-pass") {
      process.stdout.write("Validated the canonical production-misuse rejection.\n");
    } else {
      process.exitCode = 1;
    }
    return;
  }
  if (command === "preflight" || command === "preflight-local") {
    const preflightEnvironment = environment;
    if (command === "preflight-local") Object.assign(process.env, preflightEnvironment);
    const outcome = await preflightAuthSession(preflightEnvironment);
    const stderr = outcome.failure ? `${outcome.failure.message}\n` : "";
    persistPreflightOutcomeWithContext(
      command,
      preflightEnvironment,
      context,
      outcome,
    );
    if (outcome.failure) {
      process.stderr.write(stderr);
      process.exitCode = 1;
    } else {
      process.stdout.write(
        "Advisory auth preflight passed for anonymous session, Google sign-in, and sign-out routes.\n",
      );
    }
    return;
  }
  throw new Error("Unknown structured auth command");
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === "production-misuse-child") {
    await runProductionMisuseChild(process.env);
    return;
  }
  if (
    command === "export-github-env" ||
    command === "validate-env" ||
    command === "production-misuse" ||
    command === "preflight" ||
    command === "preflight-local"
  ) {
    await executeStructuredCommand(command);
    return;
  }
  if (command === "runtime-smoke-local") {
    const environment = localFixtureEnvironment();
    const result = spawnSync(
      process.platform === "win32" ? "npx.cmd" : "npx",
      [
        "playwright",
        "test",
        "tests/e2e/00-runtime-smoke.spec.ts",
        "--project=chromium",
      ],
      {
        cwd: process.cwd(),
        env: {
          ...environment,
          RUNTIME_SMOKE_PHASE_TIMINGS_PATH:
            ".local/runtime-smoke-phase-timings.json",
        },
        stdio: "inherit",
      },
    );
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`Runtime-smoke local test exited with status ${result.status ?? 1}`);
    }
    return;
  }
  throw new Error(
    "Usage: ci-auth-fixture.ts export-github-env|validate-env|production-misuse|preflight|preflight-local|runtime-smoke-local",
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
