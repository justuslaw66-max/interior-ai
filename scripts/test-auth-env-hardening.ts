import { getAuthEnvOrThrow } from "../lib/auth-env";

type EnvSnapshot = Partial<Record<"AUTH_SECRET" | "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET", string | undefined>>;

function withEnv(overrides: EnvSnapshot, fn: () => void): void {
  const previous: EnvSnapshot = {
    AUTH_SECRET: process.env.AUTH_SECRET,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  };

  if (overrides.AUTH_SECRET === undefined) {
    delete process.env.AUTH_SECRET;
  } else {
    process.env.AUTH_SECRET = overrides.AUTH_SECRET;
  }

  if (overrides.GOOGLE_CLIENT_ID === undefined) {
    delete process.env.GOOGLE_CLIENT_ID;
  } else {
    process.env.GOOGLE_CLIENT_ID = overrides.GOOGLE_CLIENT_ID;
  }

  if (overrides.GOOGLE_CLIENT_SECRET === undefined) {
    delete process.env.GOOGLE_CLIENT_SECRET;
  } else {
    process.env.GOOGLE_CLIENT_SECRET = overrides.GOOGLE_CLIENT_SECRET;
  }

  try {
    fn();
  } finally {
    process.env.AUTH_SECRET = previous.AUTH_SECRET;
    process.env.GOOGLE_CLIENT_ID = previous.GOOGLE_CLIENT_ID;
    process.env.GOOGLE_CLIENT_SECRET = previous.GOOGLE_CLIENT_SECRET;
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
  withEnv(
    {
      AUTH_SECRET: "1234567890abcdef",
      GOOGLE_CLIENT_ID: "123456789012-testclient.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "GOCSPX-test-secret-value",
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
      GOOGLE_CLIENT_ID: " 123456789012-testclient.apps.googleusercontent.com\n",
      GOOGLE_CLIENT_SECRET: "\nGOCSPX-test-secret-value  ",
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
      GOOGLE_CLIENT_ID: "123456789012-testclient.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "GOCSPX-test-secret-value",
    },
    () => {
      expectThrow(() => getAuthEnvOrThrow(), "AUTH_SECRET must be at least 16 characters");
    }
  );

  withEnv(
    {
      AUTH_SECRET: "1234567890abcdef",
      GOOGLE_CLIENT_ID: "not-a-client-id",
      GOOGLE_CLIENT_SECRET: "GOCSPX-test-secret-value",
    },
    () => {
      expectThrow(() => getAuthEnvOrThrow(), "GOOGLE_CLIENT_ID does not match expected");
    }
  );

  withEnv(
    {
      AUTH_SECRET: "1234567890abcdef",
      GOOGLE_CLIENT_ID: "123456789012-testclient.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "bad-secret",
    },
    () => {
      expectThrow(() => getAuthEnvOrThrow(), "GOOGLE_CLIENT_SECRET does not match expected");
    }
  );

  withEnv(
    {
      AUTH_SECRET: undefined,
      GOOGLE_CLIENT_ID: "123456789012-testclient.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "GOCSPX-test-secret-value",
    },
    () => {
      expectThrow(() => getAuthEnvOrThrow(), "Missing required environment variable: AUTH_SECRET");
    }
  );

  console.log("Auth env hardening tests passed");
}

run();
