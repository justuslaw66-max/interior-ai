import {
  appendFileSync,
  existsSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import net from "node:net";
import path from "node:path";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";

import { getAuthEnvOrThrow } from "../lib/auth-env";
import { getApplicationEnvironment } from "../lib/config";

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
    throw new Error("Synthetic CI OAuth fixture policy is missing or malformed");
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
const PREFLIGHT_AUTH_URL = `http://${PREFLIGHT_HOST}:${PREFLIGHT_PORT}/api/auth`;
const PREFLIGHT_URL = `${PREFLIGHT_AUTH_URL}/session`;
const PREFLIGHT_TIMEOUT_MS = 120_000;

function assertExplicitFixtureScope(environment: NodeJS.ProcessEnv): void {
  if (environment.CI_AUTH_FIXTURE_MODE !== "1") {
    throw new Error("Synthetic CI OAuth fixture mode is not explicitly enabled");
  }
  const applicationEnvironment = getApplicationEnvironment(environment);
  if (applicationEnvironment !== "development" && applicationEnvironment !== "staging") {
    throw new Error("Synthetic CI OAuth fixture requires an explicit non-production environment");
  }
}

function generateSyntheticFixtureForExport(): SyntheticCiOAuthFixture {
  if (
    !SYNTHETIC_CI_OAUTH_FIXTURE_POLICY.generatedAtRuntime ||
    SYNTHETIC_CI_OAUTH_FIXTURE_POLICY.usesRepositoryOrOrganizationSecrets ||
    SYNTHETIC_CI_OAUTH_FIXTURE_POLICY.externalAuthenticationCapable
  ) {
    throw new Error("Synthetic CI OAuth fixture policy does not permit runtime generation");
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
} = {}): void {
  assertExplicitFixtureScope(environment);
  if (environment.CI !== "true" || environment.GITHUB_ACTIONS !== "true") {
    throw new Error("Synthetic CI OAuth fixture export requires GitHub Actions CI");
  }
  const githubEnvironmentPath = environment.GITHUB_ENV;
  if (!githubEnvironmentPath || !path.isAbsolute(githubEnvironmentPath)) {
    throw new Error("GitHub Actions environment file is unavailable");
  }
  const githubWorkspacePath = environment.GITHUB_WORKSPACE;
  if (!githubWorkspacePath || !path.isAbsolute(githubWorkspacePath)) {
    throw new Error("GitHub Actions workspace is unavailable");
  }
  if (!existsSync(githubEnvironmentPath) || !statSync(githubEnvironmentPath).isFile()) {
    throw new Error("GitHub Actions environment file is absent");
  }
  if (!existsSync(githubWorkspacePath) || !statSync(githubWorkspacePath).isDirectory()) {
    throw new Error("GitHub Actions workspace is absent");
  }
  const resolvedEnvironmentPath = realpathSync(githubEnvironmentPath);
  const resolvedWorkspacePath = realpathSync(githubWorkspacePath);
  if (isPathInside(resolvedWorkspacePath, resolvedEnvironmentPath)) {
    throw new Error("GitHub Actions environment file must remain outside GITHUB_WORKSPACE");
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
}

export function validateFixtureEnvironment(): void {
  assertExplicitFixtureScope(process.env);
  if (process.env.CI !== "true" || process.env.GITHUB_ACTIONS !== "true") {
    throw new Error("Synthetic CI OAuth fixture validation requires GitHub Actions CI");
  }
  const authEnvironment = getAuthEnvOrThrow();
  if (
    process.env.CI_AUTH_FIXTURE_ACTIVE !== "1" ||
    !syntheticFixtureMatches(
      authEnvironment.googleClientId,
      authEnvironment.googleClientSecret,
    )
  ) {
    throw new Error("GitHub Actions did not propagate the canonical CI OAuth fixture");
  }
  console.log("Validated the canonical synthetic CI OAuth fixture.");
}

async function assertPortAvailable(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const socket = net.createConnection({ host: PREFLIGHT_HOST, port: PREFLIGHT_PORT });
    socket.once("connect", () => {
      socket.destroy();
      reject(new Error("Advisory auth preflight port is already in use"));
    });
    socket.once("error", () => resolve());
  });
}

async function stopServer(server: ChildProcess): Promise<void> {
  if (server.exitCode !== null) return;
  server.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolve) => server.once("exit", () => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (server.exitCode === null) server.kill("SIGKILL");
}

async function fetchAuthJson(
  pathName: string,
  init?: RequestInit,
): Promise<{ payload: unknown; response: Response }> {
  const response = await fetch(`${PREFLIGHT_AUTH_URL}/${pathName}`, init);
  const contentType = response.headers.get("content-type") ?? "";
  if (response.status !== 200 || !contentType.toLowerCase().includes("application/json")) {
    throw new Error(`Advisory auth ${pathName} endpoint did not return structured JSON`);
  }
  try {
    return { payload: JSON.parse(await response.text()) as unknown, response };
  } catch {
    throw new Error(`Advisory auth ${pathName} endpoint returned HTML or malformed JSON`);
  }
}

function requireRecord(value: unknown, description: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Advisory auth ${description} response has an unexpected shape`);
  }
  return value as Record<string, unknown>;
}

async function assertAuthInteractionCompatibility(
  expectedGoogleClientId: string,
): Promise<void> {
  const { payload: providersPayload } = await fetchAuthJson("providers");
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
    throw new Error("Advisory auth Google provider routes changed unexpectedly");
  }

  const { payload: csrfPayload, response: csrfResponse } = await fetchAuthJson("csrf");
  const csrfToken = requireRecord(csrfPayload, "CSRF").csrfToken;
  if (typeof csrfToken !== "string" || csrfToken.length < 32) {
    throw new Error("Advisory auth CSRF response did not contain a valid token");
  }
  const cookie = csrfResponse.headers
    .getSetCookie()
    .map((value) => value.split(";", 1)[0])
    .join("; ");
  if (!cookie.includes("authjs.csrf-token=")) {
    throw new Error("Advisory auth CSRF cookie was not issued");
  }

  const requestHeaders = {
    Cookie: cookie,
    "Content-Type": "application/x-www-form-urlencoded",
    "X-Auth-Return-Redirect": "1",
  };
  const { payload: signOutPayload } = await fetchAuthJson("signout", {
    method: "POST",
    headers: requestHeaders,
    body: new URLSearchParams({ csrfToken }),
    redirect: "manual",
  });
  const signOutUrl = new URL(String(requireRecord(signOutPayload, "sign-out").url));
  if (signOutUrl.origin !== signInUrl.origin || signOutUrl.pathname !== "/") {
    throw new Error("Advisory auth sign-out redirect changed unexpectedly");
  }

  const { payload: signInPayload } = await fetchAuthJson("signin/google", {
    method: "POST",
    headers: requestHeaders,
    body: new URLSearchParams({
      csrfToken,
      callbackUrl: new URL("/design", signInUrl.origin).href,
    }),
    redirect: "manual",
  });
  const authorizationUrl = new URL(String(requireRecord(signInPayload, "sign-in").url));
  if (
    authorizationUrl.protocol !== "https:" ||
    authorizationUrl.hostname !== "accounts.google.com" ||
    authorizationUrl.searchParams.get("client_id") !== expectedGoogleClientId ||
    authorizationUrl.searchParams.get("redirect_uri") !== callbackUrl.href ||
    authorizationUrl.searchParams.get("response_type") !== "code" ||
    !authorizationUrl.searchParams.get("code_challenge")
  ) {
    throw new Error("Advisory auth Google authorization redirect changed unexpectedly");
  }
}

async function preflightAuthSession(environment: NodeJS.ProcessEnv): Promise<void> {
  assertExplicitFixtureScope(environment);
  const authEnvironment = getAuthEnvOrThrow();
  if (
    environment.CI_AUTH_FIXTURE_ACTIVE !== "1" ||
    !syntheticFixtureMatches(
      authEnvironment.googleClientId,
      authEnvironment.googleClientSecret,
    )
  ) {
    throw new Error("Advisory auth preflight did not receive the canonical CI OAuth fixture");
  }
  await assertPortAvailable();

  const nextExecutable = path.join(
    process.cwd(),
    "node_modules",
    ".bin",
    process.platform === "win32" ? "next.cmd" : "next",
  );
  const server = spawn(
    nextExecutable,
    ["dev", "--webpack", "--hostname", PREFLIGHT_HOST, "--port", String(PREFLIGHT_PORT)],
    {
      cwd: process.cwd(),
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let outputCategory = "clean";
  const inspectOutput = (chunk: Buffer): void => {
    const text = chunk.toString("utf8");
    if (/ClientFetchError|Unexpected token\s+['\"]?</.test(text)) {
      outputCategory = "auth-client-html-error";
    } else if (/auth module initialization|Missing required environment variable/.test(text)) {
      outputCategory = "auth-initialization-error";
    }
  };
  server.stdout?.on("data", inspectOutput);
  server.stderr?.on("data", inspectOutput);

  try {
    const deadline = Date.now() + PREFLIGHT_TIMEOUT_MS;
    let response: Response | null = null;
    while (Date.now() < deadline) {
      if (server.exitCode !== null) {
        throw new Error(`Advisory auth preflight server exited with status ${server.exitCode}`);
      }
      try {
        response = await fetch(PREFLIGHT_URL, {
          headers: { Accept: "application/json" },
          redirect: "error",
        });
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    if (!response) throw new Error("Advisory auth preflight server did not become ready");
    const contentType = response.headers.get("content-type") ?? "";
    if (response.status !== 200 || !contentType.toLowerCase().includes("application/json")) {
      throw new Error("Advisory auth session endpoint did not return structured JSON");
    }
    const responseText = await response.text();
    let payload: unknown;
    try {
      payload = JSON.parse(responseText);
    } catch {
      throw new Error("Advisory auth session endpoint returned an HTML or malformed response");
    }
    if (payload !== null && (typeof payload !== "object" || Array.isArray(payload))) {
      throw new Error("Advisory auth session endpoint returned an unexpected JSON shape");
    }
    await assertAuthInteractionCompatibility(authEnvironment.googleClientId);
    if (outputCategory !== "clean") {
      throw new Error(`Advisory auth preflight detected ${outputCategory}`);
    }
    console.log(
      "Advisory auth preflight passed for anonymous session, Google sign-in, and sign-out routes.",
    );
  } finally {
    await stopServer(server);
  }
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === "export-github-env") {
    exportFixtureToGitHubEnvironment();
    return;
  }
  if (command === "validate-env") {
    validateFixtureEnvironment();
    return;
  }
  if (command === "preflight") {
    await preflightAuthSession(process.env);
    return;
  }
  if (command === "preflight-local") {
    const environment = localFixtureEnvironment();
    Object.assign(process.env, environment);
    await preflightAuthSession(environment);
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
    "Usage: ci-auth-fixture.ts export-github-env|validate-env|preflight|preflight-local|runtime-smoke-local",
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
