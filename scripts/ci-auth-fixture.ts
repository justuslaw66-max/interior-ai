import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";

import { getAuthEnvOrThrow } from "../lib/auth-env";
import { getApplicationEnvironment } from "../lib/config";

type SyntheticCiOAuthFixture = Readonly<{
  googleClientId: string;
  googleClientSecret: string;
}>;

function readCanonicalFixture(): SyntheticCiOAuthFixture {
  const fixturePath = path.join(process.cwd(), "scripts", "ci-auth-fixture.json");
  const parsed = JSON.parse(readFileSync(fixturePath, "utf8")) as Partial<SyntheticCiOAuthFixture>;
  if (
    !/^[0-9]+-gate-a3-ci\.apps\.googleusercontent\.com$/i.test(parsed.googleClientId ?? "") ||
    !/^GOCSPX[-_]gate-a3-ci-placeholder$/.test(parsed.googleClientSecret ?? "")
  ) {
    throw new Error("Canonical synthetic CI OAuth fixture is missing or malformed");
  }
  return Object.freeze({
    googleClientId: parsed.googleClientId,
    googleClientSecret: parsed.googleClientSecret,
  }) as SyntheticCiOAuthFixture;
}

const SYNTHETIC_CI_OAUTH_FIXTURE = readCanonicalFixture();

const PREFLIGHT_HOST = "127.0.0.1";
const PREFLIGHT_PORT = 3317;
const PREFLIGHT_URL = `http://${PREFLIGHT_HOST}:${PREFLIGHT_PORT}/api/auth/session`;
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

function canonicalFixtureEnvironment(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...environment,
    GOOGLE_CLIENT_ID: SYNTHETIC_CI_OAUTH_FIXTURE.googleClientId,
    GOOGLE_CLIENT_SECRET: SYNTHETIC_CI_OAUTH_FIXTURE.googleClientSecret,
    CI_AUTH_FIXTURE_ACTIVE: "1",
  };
}

function localFixtureEnvironment(): NodeJS.ProcessEnv {
  return canonicalFixtureEnvironment({
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

function exportFixtureToGitHubEnvironment(): void {
  assertExplicitFixtureScope(process.env);
  if (process.env.CI !== "true" || process.env.GITHUB_ACTIONS !== "true") {
    throw new Error("Synthetic CI OAuth fixture export requires GitHub Actions CI");
  }
  const githubEnvironmentPath = process.env.GITHUB_ENV;
  if (!githubEnvironmentPath || !path.isAbsolute(githubEnvironmentPath)) {
    throw new Error("GitHub Actions environment file is unavailable");
  }
  const fixtureDirectory = path.join(process.cwd(), ".local", "ci-auth-fixture");
  const fixtureEnvironmentPath = path.join(fixtureDirectory, "oauth-fixture.sh");
  mkdirSync(fixtureDirectory, { recursive: true, mode: 0o700 });
  writeFileSync(
    fixtureEnvironmentPath,
    [
      `export GOOGLE_CLIENT_ID=${SYNTHETIC_CI_OAUTH_FIXTURE.googleClientId}`,
      `export GOOGLE_CLIENT_SECRET=${SYNTHETIC_CI_OAUTH_FIXTURE.googleClientSecret}`,
      "export CI_AUTH_FIXTURE_ACTIVE=1",
      "",
    ].join("\n"),
    { encoding: "utf8", mode: 0o600 },
  );
  appendFileSync(
    githubEnvironmentPath,
    `BASH_ENV=${fixtureEnvironmentPath}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
  console.log("Configured the canonical synthetic CI OAuth fixture without printing values.");
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

async function preflightAuthSession(environment: NodeJS.ProcessEnv): Promise<void> {
  assertExplicitFixtureScope(environment);
  const authEnvironment = getAuthEnvOrThrow();
  if (
    authEnvironment.googleClientId !== SYNTHETIC_CI_OAUTH_FIXTURE.googleClientId ||
    authEnvironment.googleClientSecret !== SYNTHETIC_CI_OAUTH_FIXTURE.googleClientSecret
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
    if (outputCategory !== "clean") {
      throw new Error(`Advisory auth preflight detected ${outputCategory}`);
    }
    console.log("Advisory auth preflight passed with a structured anonymous session response.");
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
    "Usage: ci-auth-fixture.ts export-github-env|preflight|preflight-local|runtime-smoke-local",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
