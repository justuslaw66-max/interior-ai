import { readFileSync } from "node:fs";
import path from "node:path";

import {
  getAuthEnvOrThrow,
} from "../lib/auth-env";

const SYNTHETIC_CI_OAUTH_FIXTURE = JSON.parse(
  readFileSync(path.join(process.cwd(), "scripts", "ci-auth-fixture.json"), "utf8")
) as Readonly<{ googleClientId: string; googleClientSecret: string }>;

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

function run(): void {
  const authSource = readFileSync(path.join(process.cwd(), "lib", "auth-env.ts"), "utf8");
  assert(
    !authSource.includes(SYNTHETIC_CI_OAUTH_FIXTURE.googleClientId) &&
      !authSource.includes(SYNTHETIC_CI_OAUTH_FIXTURE.googleClientSecret),
    "Synthetic fixture values must stay outside the application build graph"
  );

  withEnv(
    {
      APP_ENV: "development",
      AUTH_SECRET: "1234567890abcdef",
      GOOGLE_CLIENT_ID: SYNTHETIC_CI_OAUTH_FIXTURE.googleClientId,
      GOOGLE_CLIENT_SECRET: SYNTHETIC_CI_OAUTH_FIXTURE.googleClientSecret,
      CI: "true",
      GITHUB_ACTIONS: "true",
      CI_AUTH_FIXTURE_ACTIVE: "1",
    },
    () => {
      const fixture = getAuthEnvOrThrow();
      assert(
        fixture.googleClientSecret === SYNTHETIC_CI_OAUTH_FIXTURE.googleClientSecret,
        "Expected the canonical synthetic OAuth fixture to pass structural validation"
      );
    }
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

run();
