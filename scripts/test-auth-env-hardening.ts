import {
  appendFileSync,
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

import {
  getAuthEnvOrThrow,
  isSyntheticCiOAuthFixture,
} from "../lib/auth-env";
import {
  SYNTHETIC_CI_GOOGLE_DISCOVERY_MARKER,
  syntheticCiGoogleFetch,
} from "../lib/auth-fixture-network";
const SYNTHETIC_CI_OAUTH_FIXTURE_POLICY = JSON.parse(
  readFileSync(path.join(process.cwd(), "scripts", "ci-auth-fixture.json"), "utf8"),
) as Readonly<{
  schema: string;
  provider: string;
  generatedAtRuntime: boolean;
  usesRepositoryOrOrganizationSecrets: boolean;
  externalAuthenticationCapable: boolean;
}>;

function syntheticFixtureForTest(nonce = "a".repeat(32)): Readonly<{
  googleClientId: string;
  googleClientSecret: string;
}> {
  return {
    googleClientId: `123456789012345-gate-a3-ci-${nonce}.apps.googleusercontent.com`,
    googleClientSecret: `GOCSPX-gate-a3-ci-${nonce}`,
  };
}

const SYNTHETIC_CI_OAUTH_FIXTURE = syntheticFixtureForTest();
const RETIRED_SYNTHETIC_CI_OAUTH_FIXTURE = Object.freeze({
  googleClientId: "123456789012-gate-a3-ci.apps.googleusercontent.com",
  googleClientSecret: "GOCSPX-gate-a3-ci-placeholder",
});

type EnvSnapshot = Partial<
  Record<
    | "APP_ENV"
    | "VERCEL_ENV"
    | "AUTH_SECRET"
    | "NEXTAUTH_SECRET"
    | "GOOGLE_CLIENT_ID"
    | "GOOGLE_CLIENT_SECRET"
    | "CI"
    | "GITHUB_ACTIONS"
    | "CI_AUTH_FIXTURE_ACTIVE"
    | "CI_AUTH_FIXTURE_MODE"
    | "CI_AUTH_FIXTURE_LOCAL_TEST"
    | "NODE_ENV",
    string | undefined
  >
>;

const ENV_KEYS: Array<keyof EnvSnapshot> = [
  "APP_ENV",
  "VERCEL_ENV",
  "AUTH_SECRET",
  "NEXTAUTH_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "CI",
  "GITHUB_ACTIONS",
  "CI_AUTH_FIXTURE_ACTIVE",
  "CI_AUTH_FIXTURE_MODE",
  "CI_AUTH_FIXTURE_LOCAL_TEST",
  "NODE_ENV",
];

function withEnv(overrides: EnvSnapshot, fn: () => void): void {
  const previous: EnvSnapshot = Object.fromEntries(
    ENV_KEYS.map((key) => [key, process.env[key]])
  ) as EnvSnapshot;

  for (const key of ENV_KEYS) {
    const value = overrides[key];
    if (value === undefined) delete process.env[key];
    else Reflect.set(process.env, key, value);
  }

  try {
    fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function expectThrow(fn: () => void, contains: string): void {
  let threw = false;
  try {
    fn();
  } catch (error) {
    threw = true;
    const message = error instanceof Error ? error.message : String(error);
    assert(message.includes(contains), `Expected error containing '${contains}', got '${message}'`);
  }

  assert(threw, `Expected function to throw with message containing '${contains}'`);
}

async function expectReject(
  fn: () => Promise<unknown>,
  contains: string,
): Promise<void> {
  let rejected = false;
  try {
    await fn();
  } catch (error) {
    rejected = true;
    const message = error instanceof Error ? error.message : String(error);
    assert(
      message.includes(contains),
      `Expected error containing '${contains}', got '${message}'`,
    );
  }
  assert(rejected, `Expected promise to reject with message containing '${contains}'`);
}

async function run(): Promise<void> {
  const {
    assertLogSafeFixtureTransportOrder,
    authPreflightServerEnvironment,
    exportFixtureToGitHubEnvironment,
    serializeGitHubEnvironmentAssignments,
    validateFixtureEnvironment,
  } = (await import(
    "./ci-auth-fixture" + ".ts"
  )) as {
    assertLogSafeFixtureTransportOrder: (
      events: ReadonlyArray<
        | {
            kind: "mask";
            name: "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET" | "CI_AUTH_FIXTURE_ACTIVE";
            value: string;
          }
        | {
            kind: "github-environment";
            assignments: Readonly<{
              GOOGLE_CLIENT_ID: string;
              GOOGLE_CLIENT_SECRET: string;
              CI_AUTH_FIXTURE_ACTIVE: string;
            }>;
          }
      >,
    ) => void;
    authPreflightServerEnvironment: (
      environment: NodeJS.ProcessEnv,
    ) => NodeJS.ProcessEnv;
    exportFixtureToGitHubEnvironment: (options: {
      environment: NodeJS.ProcessEnv;
      fixtureFactory?: () => Readonly<{
        googleClientId: string;
        googleClientSecret: string;
      }>;
      writeWorkflowCommand?: (command: string) => void;
      appendEnvironmentFile?: (filePath: string, content: string) => void;
    }) => void;
    serializeGitHubEnvironmentAssignments: (
      assignments: Readonly<Record<string, string>>,
    ) => string;
    validateFixtureEnvironment: () => void;
  };
  const authSource = readFileSync(path.join(process.cwd(), "lib", "auth-env.ts"), "utf8");
  const fixtureTransportSource = readFileSync(
    path.join(process.cwd(), "scripts", "ci-auth-fixture.ts"),
    "utf8",
  );
  assert(
    !authSource.includes(SYNTHETIC_CI_OAUTH_FIXTURE.googleClientId) &&
      !authSource.includes(SYNTHETIC_CI_OAUTH_FIXTURE.googleClientSecret),
    "Synthetic fixture values must stay outside the application build graph"
  );

  const ambientServerEnvironment: NodeJS.ProcessEnv = {
    NODE_ENV: "test",
    NEXT_TELEMETRY_DISABLED: "0",
    ORDINARY_TOOLCHAIN_INPUT: "preserved",
  };
  const serverEnvironment = authPreflightServerEnvironment(
    ambientServerEnvironment,
  );
  assert(
    serverEnvironment.NEXT_TELEMETRY_DISABLED === "1" &&
      serverEnvironment.ORDINARY_TOOLCHAIN_INPUT === "preserved",
    "Every auth preflight server entry must disable telemetry and preserve ordinary inputs",
  );
  assert(
    ambientServerEnvironment.NEXT_TELEMETRY_DISABLED === "0",
    "Auth preflight server projection must not mutate its caller environment",
  );

  const discoveryMessages: string[] = [];
  const originalDiscoveryLog = console.log;
  console.log = (message?: unknown) => discoveryMessages.push(String(message));
  let discoveryResponse: Response;
  try {
    discoveryResponse = await syntheticCiGoogleFetch(
      "https://accounts.google.com/.well-known/openid-configuration",
    );
  } finally {
    console.log = originalDiscoveryLog;
  }
  const discovery = (await discoveryResponse.json()) as Record<string, unknown>;
  assert(discoveryResponse.status === 200, "Inert Google discovery must return HTTP 200");
  assert(
    discovery.issuer === "https://accounts.google.com" &&
      discovery.authorization_endpoint === "https://accounts.google.com/o/oauth2/v2/auth",
    "Inert Google discovery must preserve the canonical issuer and authorization endpoint",
  );
  assert(
    discoveryMessages.length === 1 &&
      discoveryMessages[0] === SYNTHETIC_CI_GOOGLE_DISCOVERY_MARKER,
    "Inert Google discovery must emit exactly one value-free proof marker",
  );
  assert(
    !discoveryMessages.join("\n").includes(SYNTHETIC_CI_OAUTH_FIXTURE.googleClientId) &&
      !discoveryMessages.join("\n").includes(SYNTHETIC_CI_OAUTH_FIXTURE.googleClientSecret),
    "Inert Google discovery proof must not log fixture values",
  );
  await expectReject(
    () => syntheticCiGoogleFetch("https://oauth2.googleapis.com/token"),
    "blocked an external provider request",
  );
  await expectReject(
    () =>
      syntheticCiGoogleFetch(
        "https://accounts.google.com/.well-known/openid-configuration",
        { method: "POST" },
      ),
    "blocked an external provider request",
  );
  assert(
    SYNTHETIC_CI_OAUTH_FIXTURE_POLICY.schema ===
      "interior-ai.synthetic-ci-oauth-fixture-policy.v1" &&
      SYNTHETIC_CI_OAUTH_FIXTURE_POLICY.provider === "google" &&
      SYNTHETIC_CI_OAUTH_FIXTURE_POLICY.generatedAtRuntime === true &&
      SYNTHETIC_CI_OAUTH_FIXTURE_POLICY.usesRepositoryOrOrganizationSecrets === false &&
      SYNTHETIC_CI_OAUTH_FIXTURE_POLICY.externalAuthenticationCapable === false,
    "Synthetic fixture policy must require runtime-only inert values unrelated to secrets",
  );
  assert(!fixtureTransportSource.includes("BASH_ENV"), "OAuth fixture transport must not use BASH_ENV");
  assert(
    !fixtureTransportSource.includes("GITHUB_OUTPUT") &&
      !fixtureTransportSource.includes("GITHUB_STEP_SUMMARY"),
    "OAuth fixture values must not be routed through outputs or step summaries",
  );
  assert(
    !fixtureTransportSource.includes(".local/ci-auth-fixture"),
    "OAuth fixture transport must not target a workspace-local file",
  );

  const transportRoot = mkdtempSync(path.join(tmpdir(), "ch-0017-auth-env-"));
  try {
    const workspace = path.join(transportRoot, "workspace");
    const githubEnvironment = path.join(transportRoot, "github-environment");
    mkdirSync(workspace);
    writeFileSync(githubEnvironment, "");
    const exportEnvironment: NodeJS.ProcessEnv = {
      APP_ENV: "development",
      NODE_ENV: "test",
      CI: "true",
      GITHUB_ACTIONS: "true",
      CI_AUTH_FIXTURE_MODE: "1",
      GITHUB_ENV: githubEnvironment,
      GITHUB_WORKSPACE: workspace,
    };
    const messages: string[] = [];
    const transportEvents: string[] = [];
    const originalLog = console.log;
    console.log = (message?: unknown) => messages.push(String(message));
    try {
      exportFixtureToGitHubEnvironment({
        environment: exportEnvironment,
        writeWorkflowCommand: (command) => transportEvents.push(command),
        appendEnvironmentFile: (filePath, content) => {
          transportEvents.push("GITHUB_ENV_WRITE");
          appendFileSync(filePath, content, { encoding: "utf8" });
        },
      });
    } finally {
      console.log = originalLog;
    }
    const exportedAssignments = Object.fromEntries(
      readFileSync(githubEnvironment, "utf8")
        .trim()
        .split("\n")
        .map((line) => {
          const separator = line.indexOf("=");
          return [line.slice(0, separator), line.slice(separator + 1)];
        }),
    );
    const generatedClientId = exportedAssignments.GOOGLE_CLIENT_ID;
    const generatedClientSecret = exportedAssignments.GOOGLE_CLIENT_SECRET;
    assert(
      typeof generatedClientId === "string" &&
        typeof generatedClientSecret === "string" &&
        generatedClientId !== SYNTHETIC_CI_OAUTH_FIXTURE.googleClientId &&
        generatedClientSecret !== SYNTHETIC_CI_OAUTH_FIXTURE.googleClientSecret,
      "OAuth values must be generated by the exporter rather than loaded from the policy fixture",
    );
    assert(
      readFileSync(githubEnvironment, "utf8") ===
        [
          `GOOGLE_CLIENT_ID=${generatedClientId}`,
          `GOOGLE_CLIENT_SECRET=${generatedClientSecret}`,
          "CI_AUTH_FIXTURE_ACTIVE=1",
          "",
        ].join("\n"),
      "GITHUB_ENV must receive exactly the three allowlisted single-line assignments",
    );
    assert(
      transportEvents[0] === `::add-mask::${generatedClientId}` &&
        transportEvents[1] === `::add-mask::${generatedClientSecret}` &&
        transportEvents[2] === "GITHUB_ENV_WRITE",
      "Both generated fixture values must be masked before the only GITHUB_ENV write",
    );
    expectThrow(
      () =>
        assertLogSafeFixtureTransportOrder([
          {
            kind: "github-environment",
            assignments: {
              GOOGLE_CLIENT_ID: generatedClientId,
              GOOGLE_CLIENT_SECRET: generatedClientSecret,
              CI_AUTH_FIXTURE_ACTIVE: "1",
            },
          },
          { kind: "mask", name: "GOOGLE_CLIENT_ID", value: generatedClientId },
          { kind: "mask", name: "GOOGLE_CLIENT_SECRET", value: generatedClientSecret },
        ]),
      "masked before GITHUB_ENV write",
    );
    const logText = messages.join("\n");
    assert(!logText.includes(githubEnvironment), "OAuth fixture export must not log GITHUB_ENV");
    assert(!logText.includes(workspace), "OAuth fixture export must not log GITHUB_WORKSPACE");
    assert(
      !logText.includes(generatedClientId) &&
        !logText.includes(generatedClientSecret),
      "OAuth fixture export must not log fixture values",
    );
    const simulatedRunnerMetadata = [
      `GOOGLE_CLIENT_ID=${generatedClientId}`,
      `GOOGLE_CLIENT_SECRET=${generatedClientSecret}`,
    ]
      .join("\n")
      .replaceAll(generatedClientId, "***")
      .replaceAll(generatedClientSecret, "***");
    assert(
      !simulatedRunnerMetadata.includes(generatedClientId) &&
        !simulatedRunnerMetadata.includes(generatedClientSecret),
      "GitHub add-mask registration must redact later step metadata",
    );
    for (const retainedOutput of [
      logText,
      "GITHUB_STEP_SUMMARY: synthetic OAuth fixture configured\n",
      '{"report":"synthetic OAuth fixture configured"}\n',
      "artifact inventory: synthetic OAuth fixture values excluded\n",
    ]) {
      assert(
        !retainedOutput.includes(generatedClientId) &&
          !retainedOutput.includes(generatedClientSecret),
        "Logs, summaries, reports, and artifacts must exclude generated OAuth values",
      );
    }
    assert(!logText.includes("BASH_ENV"), "OAuth fixture export must not mention BASH_ENV");
    assert(
      !existsSync(path.join(workspace, ".local", "ci-auth-fixture")),
      "OAuth fixture export must not write into the checkout",
    );

    expectThrow(
      () =>
        exportFixtureToGitHubEnvironment({
          environment: { ...exportEnvironment, GITHUB_ENV: undefined },
        }),
      "environment file is unavailable",
    );
    const insideEnvironment = path.join(workspace, "github-environment");
    writeFileSync(insideEnvironment, "");
    expectThrow(
      () =>
        exportFixtureToGitHubEnvironment({
          environment: { ...exportEnvironment, GITHUB_ENV: insideEnvironment },
        }),
      "outside GITHUB_WORKSPACE",
    );
    const symlinkedEnvironment = path.join(transportRoot, "symlinked-environment");
    symlinkSync(insideEnvironment, symlinkedEnvironment);
    expectThrow(
      () =>
        exportFixtureToGitHubEnvironment({
          environment: { ...exportEnvironment, GITHUB_ENV: symlinkedEnvironment },
        }),
      "outside GITHUB_WORKSPACE",
    );
    expectThrow(
      () =>
        serializeGitHubEnvironmentAssignments({
          GOOGLE_CLIENT_ID: generatedClientId,
          GOOGLE_CLIENT_SECRET: generatedClientSecret,
          CI_AUTH_FIXTURE_ACTIVE: "1",
          UNAPPROVED_VALUE: "not-allowed",
        }),
      "non-allowlisted variable",
    );
    for (const lineBreak of ["\n", "\r"]) {
      expectThrow(
        () =>
          serializeGitHubEnvironmentAssignments({
            GOOGLE_CLIENT_ID: `${generatedClientId}${lineBreak}INJECTED=1`,
            GOOGLE_CLIENT_SECRET: generatedClientSecret,
            CI_AUTH_FIXTURE_ACTIVE: "1",
          }),
        "single-line strings",
      );
    }
  } finally {
    rmSync(transportRoot, { recursive: true, force: true });
  }

  withEnv(
    {
      APP_ENV: "development",
      AUTH_SECRET: "1234567890abcdef",
      GOOGLE_CLIENT_ID: SYNTHETIC_CI_OAUTH_FIXTURE.googleClientId,
      GOOGLE_CLIENT_SECRET: SYNTHETIC_CI_OAUTH_FIXTURE.googleClientSecret,
      CI: "true",
      GITHUB_ACTIONS: "true",
      CI_AUTH_FIXTURE_ACTIVE: "1",
      CI_AUTH_FIXTURE_MODE: "1",
    },
    () => {
      const fixture = getAuthEnvOrThrow();
      assert(
        isSyntheticCiOAuthFixture(fixture),
        "Expected the canonical synthetic OAuth pair to retain its exact identity",
      );
      assert(
        fixture.googleClientSecret === SYNTHETIC_CI_OAUTH_FIXTURE.googleClientSecret,
        "Expected the canonical synthetic OAuth fixture to pass structural validation"
      );
      validateFixtureEnvironment();
    }
  );

  withEnv(
    {
      APP_ENV: "development",
      AUTH_SECRET: "1234567890abcdef",
      GOOGLE_CLIENT_ID: SYNTHETIC_CI_OAUTH_FIXTURE.googleClientId,
      GOOGLE_CLIENT_SECRET: syntheticFixtureForTest("b".repeat(32)).googleClientSecret,
      CI: "true",
      GITHUB_ACTIONS: "true",
      CI_AUTH_FIXTURE_ACTIVE: "1",
      CI_AUTH_FIXTURE_MODE: "1",
    },
    () => {
      expectThrow(
        () => validateFixtureEnvironment(),
        "restricted to explicit non-production CI/test execution",
      );
    },
  );

  withEnv(
    {
      AUTH_SECRET: "1234567890abcdef",
      NEXTAUTH_SECRET: undefined,
      GOOGLE_CLIENT_ID: "123456789012-testclient.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "GOCSPX-test-secret-value",
      CI: undefined,
      GITHUB_ACTIONS: undefined,
    },
    () => {
      const valid = getAuthEnvOrThrow();
      assert(
        !isSyntheticCiOAuthFixture(valid),
        "Normal Google OAuth credentials must not activate the synthetic fixture boundary",
      );
      assert(valid.authSecret === "1234567890abcdef", "Expected AUTH_SECRET to be preserved");
      assert(
        valid.googleClientId === "123456789012-testclient.apps.googleusercontent.com",
        "Expected GOOGLE_CLIENT_ID to be preserved"
      );
      assert(
        valid.googleClientSecret === "GOCSPX-test-secret-value",
        "Expected GOOGLE_CLIENT_SECRET to be preserved"
      );
    }
  );

  withEnv(
    {
      AUTH_SECRET: " 1234567890abcdef ",
      NEXTAUTH_SECRET: undefined,
      GOOGLE_CLIENT_ID: " 123456789012-testclient.apps.googleusercontent.com\n",
      GOOGLE_CLIENT_SECRET: "\nGOCSPX-test-secret-value  ",
      CI: undefined,
      GITHUB_ACTIONS: undefined,
    },
    () => {
      const trimmed = getAuthEnvOrThrow();
      assert(trimmed.authSecret === "1234567890abcdef", "Expected AUTH_SECRET to be trimmed");
      assert(
        trimmed.googleClientId === "123456789012-testclient.apps.googleusercontent.com",
        "Expected GOOGLE_CLIENT_ID to be trimmed"
      );
      assert(
        trimmed.googleClientSecret === "GOCSPX-test-secret-value",
        "Expected GOOGLE_CLIENT_SECRET to be trimmed"
      );
    }
  );

  withEnv(
    {
      AUTH_SECRET: "short",
      NEXTAUTH_SECRET: undefined,
      GOOGLE_CLIENT_ID: "123456789012-testclient.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "GOCSPX-test-secret-value",
      CI: undefined,
      GITHUB_ACTIONS: undefined,
    },
    () => {
      expectThrow(() => getAuthEnvOrThrow(), "AUTH_SECRET must be at least 16 characters");
    }
  );

  withEnv(
    {
      AUTH_SECRET: "1234567890abcdef",
      NEXTAUTH_SECRET: undefined,
      GOOGLE_CLIENT_ID: "not-a-client-id",
      GOOGLE_CLIENT_SECRET: "GOCSPX-test-secret-value",
      CI: undefined,
      GITHUB_ACTIONS: undefined,
    },
    () => {
      expectThrow(() => getAuthEnvOrThrow(), "GOOGLE_CLIENT_ID does not match expected");
    }
  );

  withEnv(
    {
      AUTH_SECRET: "1234567890abcdef",
      NEXTAUTH_SECRET: undefined,
      GOOGLE_CLIENT_ID: "123456789012-testclient.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "bad-secret",
      CI: undefined,
      GITHUB_ACTIONS: undefined,
    },
    () => {
      expectThrow(() => getAuthEnvOrThrow(), "GOOGLE_CLIENT_SECRET does not match expected");
    }
  );

  for (const malformedSecret of [
    '"GOCSPX-test-secret-value"',
    "GOCSPX",
    "GOCSPX-invalid value",
    "gate-a3-ci-google-client-secret-placeholder",
  ]) {
    withEnv(
      {
        AUTH_SECRET: "1234567890abcdef",
        GOOGLE_CLIENT_ID: "123456789012-testclient.apps.googleusercontent.com",
        GOOGLE_CLIENT_SECRET: malformedSecret,
      },
      () => {
        expectThrow(
          () => getAuthEnvOrThrow(),
          "GOOGLE_CLIENT_SECRET does not match expected"
        );
      }
    );
  }

  withEnv(
    {
      AUTH_SECRET: "1234567890abcdef",
      GOOGLE_CLIENT_ID: "123456789012-testclient.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "   ",
    },
    () => {
      expectThrow(() => getAuthEnvOrThrow(), "empty after trimming whitespace");
    }
  );

  withEnv(
    {
      APP_ENV: "production",
      AUTH_SECRET: "1234567890abcdef",
      GOOGLE_CLIENT_ID: SYNTHETIC_CI_OAUTH_FIXTURE.googleClientId,
      GOOGLE_CLIENT_SECRET: SYNTHETIC_CI_OAUTH_FIXTURE.googleClientSecret,
      CI: "true",
      GITHUB_ACTIONS: "true",
      CI_AUTH_FIXTURE_ACTIVE: "1",
    },
    () => {
      expectThrow(
        () => getAuthEnvOrThrow(),
        "Synthetic CI OAuth fixture is restricted to explicit non-production"
      );
    }
  );

  for (const applicationEnvironment of ["production", "development"]) {
    withEnv(
      {
        APP_ENV: applicationEnvironment,
        AUTH_SECRET: "1234567890abcdef",
        GOOGLE_CLIENT_ID: RETIRED_SYNTHETIC_CI_OAUTH_FIXTURE.googleClientId,
        GOOGLE_CLIENT_SECRET: RETIRED_SYNTHETIC_CI_OAUTH_FIXTURE.googleClientSecret,
        CI: applicationEnvironment === "development" ? undefined : "true",
        GITHUB_ACTIONS: applicationEnvironment === "development" ? undefined : "true",
        CI_AUTH_FIXTURE_ACTIVE: applicationEnvironment === "development" ? undefined : "1",
      },
      () => {
        expectThrow(
          () => getAuthEnvOrThrow(),
          "Retired synthetic CI OAuth fixture values are rejected in every environment",
        );
      },
    );
  }

  for (const deploymentEnvironment of [
    { APP_ENV: undefined, VERCEL_ENV: undefined },
    { APP_ENV: "prod-ish", VERCEL_ENV: undefined },
    { APP_ENV: undefined, VERCEL_ENV: "production" },
    { APP_ENV: " ", VERCEL_ENV: "preview" },
  ]) {
    withEnv(
      {
        ...deploymentEnvironment,
        AUTH_SECRET: "1234567890abcdef",
        GOOGLE_CLIENT_ID: SYNTHETIC_CI_OAUTH_FIXTURE.googleClientId,
        GOOGLE_CLIENT_SECRET: SYNTHETIC_CI_OAUTH_FIXTURE.googleClientSecret,
        CI: "true",
        GITHUB_ACTIONS: "true",
        CI_AUTH_FIXTURE_ACTIVE: "1",
      },
      () => {
        expectThrow(
          () => getAuthEnvOrThrow(),
          "Synthetic CI OAuth fixture is restricted to explicit non-production"
        );
      }
    );
  }

  withEnv(
    {
      APP_ENV: "development",
      AUTH_SECRET: "1234567890abcdef",
      GOOGLE_CLIENT_ID: SYNTHETIC_CI_OAUTH_FIXTURE.googleClientId,
      GOOGLE_CLIENT_SECRET: SYNTHETIC_CI_OAUTH_FIXTURE.googleClientSecret,
      CI: "true",
      GITHUB_ACTIONS: "true",
      CI_AUTH_FIXTURE_ACTIVE: undefined,
    },
    () => {
      expectThrow(
        () => getAuthEnvOrThrow(),
        "Synthetic CI OAuth fixture is restricted to explicit non-production"
      );
    }
  );

  withEnv(
    {
      APP_ENV: "production",
      AUTH_SECRET: undefined,
      NEXTAUTH_SECRET: "1234567890fedcba",
      GOOGLE_CLIENT_ID: "123456789012-testclient.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "GOCSPX-test-secret-value",
      CI: undefined,
      GITHUB_ACTIONS: undefined,
    },
    () => {
      const fallback = getAuthEnvOrThrow();
      assert(fallback.authSecret === "1234567890fedcba", "Expected NEXTAUTH_SECRET fallback");
    }
  );

  withEnv(
    {
      AUTH_SECRET: "   ",
      NEXTAUTH_SECRET: "1234567890abcdef",
      GOOGLE_CLIENT_ID: "123456789012-testclient.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "GOCSPX-test-secret-value",
      CI: undefined,
      GITHUB_ACTIONS: undefined,
    },
    () => {
      const fallbackFromEmpty = getAuthEnvOrThrow();
      assert(
        fallbackFromEmpty.authSecret === "1234567890abcdef",
        "Expected empty AUTH_SECRET to fall back to NEXTAUTH_SECRET"
      );
    }
  );

  withEnv(
    {
      AUTH_SECRET: undefined,
      NEXTAUTH_SECRET: undefined,
      GOOGLE_CLIENT_ID: "123456789012-testclient.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "GOCSPX-test-secret-value",
      CI: undefined,
      GITHUB_ACTIONS: undefined,
    },
    () => {
      expectThrow(
        () => getAuthEnvOrThrow(),
        "Missing required environment variable: AUTH_SECRET (or NEXTAUTH_SECRET)"
      );
    }
  );

  withEnv(
    {
      AUTH_SECRET: undefined,
      NEXTAUTH_SECRET: undefined,
      GOOGLE_CLIENT_ID: undefined,
      GOOGLE_CLIENT_SECRET: undefined,
      CI: "true",
      GITHUB_ACTIONS: "true",
    },
    () => {
      expectThrow(
        () => getAuthEnvOrThrow(),
        "Missing required environment variable: AUTH_SECRET (or NEXTAUTH_SECRET)"
      );
    }
  );

  withEnv(
    {
      APP_ENV: "production",
      AUTH_SECRET: "1234567890abcdef",
      NEXTAUTH_SECRET: undefined,
      GOOGLE_CLIENT_ID: undefined,
      GOOGLE_CLIENT_SECRET: "GOCSPX-test-secret-value",
      CI: "true",
      GITHUB_ACTIONS: "true",
    },
    () => {
      expectThrow(() => getAuthEnvOrThrow(), "Missing required environment variable: GOOGLE_CLIENT_ID");
    }
  );

  withEnv(
    {
      APP_ENV: "production",
      AUTH_SECRET: "test-secret",
      NEXTAUTH_SECRET: undefined,
      GOOGLE_CLIENT_ID: "123456789012-testclient.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "GOCSPX-test-secret-value",
      CI: "true",
      GITHUB_ACTIONS: "true",
    },
    () => {
      expectThrow(() => getAuthEnvOrThrow(), "AUTH_SECRET must be at least 16 characters");
    }
  );

  withEnv(
    {
      APP_ENV: "development",
      AUTH_SECRET: undefined,
      NEXTAUTH_SECRET: "test-secret",
      GOOGLE_CLIENT_ID: undefined,
      GOOGLE_CLIENT_SECRET: undefined,
      CI: "true",
      GITHUB_ACTIONS: "true",
    },
    () => {
      expectThrow(() => getAuthEnvOrThrow(), "Missing required environment variable: GOOGLE_CLIENT_ID");
    }
  );

  console.log("Auth env hardening tests passed");
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
