import { getAuthEnvOrThrow } from "../lib/auth-env";

type EnvSnapshot = Partial<
  Record<
    "AUTH_SECRET" | "NEXTAUTH_SECRET" | "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET" | "CI" | "GITHUB_ACTIONS",
    string | undefined
  >
>;

function withEnv(overrides: EnvSnapshot, fn: () => void): void {
  const previous: EnvSnapshot = {
    AUTH_SECRET: process.env.AUTH_SECRET,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    CI: process.env.CI,
    GITHUB_ACTIONS: process.env.GITHUB_ACTIONS,
  };

  if (overrides.AUTH_SECRET === undefined) {
    delete process.env.AUTH_SECRET;
  } else {
    process.env.AUTH_SECRET = overrides.AUTH_SECRET;
  }

  if (overrides.NEXTAUTH_SECRET === undefined) {
    delete process.env.NEXTAUTH_SECRET;
  } else {
    process.env.NEXTAUTH_SECRET = overrides.NEXTAUTH_SECRET;
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

  if (overrides.CI === undefined) {
    delete process.env.CI;
  } else {
    process.env.CI = overrides.CI;
  }

  if (overrides.GITHUB_ACTIONS === undefined) {
    delete process.env.GITHUB_ACTIONS;
  } else {
    process.env.GITHUB_ACTIONS = overrides.GITHUB_ACTIONS;
  }

  try {
    fn();
  } finally {
    process.env.AUTH_SECRET = previous.AUTH_SECRET;
    process.env.NEXTAUTH_SECRET = previous.NEXTAUTH_SECRET;
    process.env.GOOGLE_CLIENT_ID = previous.GOOGLE_CLIENT_ID;
    process.env.GOOGLE_CLIENT_SECRET = previous.GOOGLE_CLIENT_SECRET;
    process.env.CI = previous.CI;
    process.env.GITHUB_ACTIONS = previous.GITHUB_ACTIONS;
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

  withEnv(
    {
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
      const ciFallback = getAuthEnvOrThrow();
      assert(ciFallback.authSecret.length >= 16, "Expected CI fallback AUTH secret to be valid");
      assert(
        ciFallback.googleClientId.endsWith(".apps.googleusercontent.com"),
        "Expected CI fallback Google client id format"
      );
      assert(
        ciFallback.googleClientSecret.startsWith("GOCSPX"),
        "Expected CI fallback Google secret format"
      );
    }
  );

  withEnv(
    {
      AUTH_SECRET: undefined,
      NEXTAUTH_SECRET: "test-secret",
      GOOGLE_CLIENT_ID: undefined,
      GOOGLE_CLIENT_SECRET: undefined,
      CI: "true",
      GITHUB_ACTIONS: "true",
    },
    () => {
      const ciShortSecret = getAuthEnvOrThrow();
      assert(ciShortSecret.authSecret === "test-secret", "Expected CI short secret to be accepted");
    }
  );

  console.log("Auth env hardening tests passed");
}

run();
