import { getApplicationEnvironment } from "./config";

type RequiredAuthEnvKey = "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET";

type AuthEnv = {
  authSecret: string;
  googleClientId: string;
  googleClientSecret: string;
};

export function isSyntheticCiOAuthFixture(authEnv: AuthEnv): boolean {
  const client = authEnv.googleClientId.match(
    /^[0-9]+-gate-a3-ci-([a-f0-9]{32})\.apps\.googleusercontent\.com$/i,
  );
  const secret = authEnv.googleClientSecret.match(
    /^GOCSPX[-_]gate-a3-ci-([a-f0-9]{32})$/i,
  );
  return Boolean(
    client && secret && client[1]?.toLowerCase() === secret[1]?.toLowerCase(),
  );
}

const REQUIRED_AUTH_KEYS: RequiredAuthEnvKey[] = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
];

const AUTH_SECRET_KEYS = ["AUTH_SECRET", "NEXTAUTH_SECRET"] as const;
type AuthSecretKey = (typeof AUTH_SECRET_KEYS)[number];

const GOOGLE_CLIENT_ID_PATTERN = /^[0-9]+-[a-z0-9-]+\.apps\.googleusercontent\.com$/i;
const GOOGLE_CLIENT_SECRET_PATTERN = /^GOCSPX[-_A-Za-z0-9]+$/;

function readAndSanitizeRequiredEnv(key: RequiredAuthEnvKey): string {
  const raw = process.env[key];
  if (raw === undefined || raw === null) {
    throw new Error(`[auth] Missing required environment variable: ${key}`);
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error(`[auth] Environment variable ${key} is empty after trimming whitespace`);
  }

  if (raw !== trimmed) {
    // Prevent hard-to-debug OAuth failures caused by accidental newlines/spaces.
    console.warn(`[auth] ${key} contained surrounding whitespace and was trimmed`);
  }

  return trimmed;
}

function readAndSanitizeAuthSecretEnv(): string {
  const emptyKeys: AuthSecretKey[] = [];

  for (const key of AUTH_SECRET_KEYS) {
    const raw = process.env[key];
    if (raw === undefined || raw === null) {
      continue;
    }

    const trimmed = raw.trim();
    if (!trimmed) {
      emptyKeys.push(key);
      continue;
    }

    if (raw !== trimmed) {
      console.warn(`[auth] ${key} contained surrounding whitespace and was trimmed`);
    }

    return trimmed;
  }

  if (emptyKeys.length > 0) {
    throw new Error(
      `[auth] Environment variable(s) ${emptyKeys.join(", ")} are empty after trimming whitespace`
    );
  }

  throw new Error(
    `[auth] Missing required environment variable: AUTH_SECRET (or NEXTAUTH_SECRET)`
  );
}

function validateAuthShapeOrThrow(authEnv: AuthEnv): void {
  if (authEnv.authSecret.length < 16) {
    throw new Error("[auth] AUTH_SECRET must be at least 16 characters");
  }

  if (!GOOGLE_CLIENT_ID_PATTERN.test(authEnv.googleClientId)) {
    throw new Error(
      "[auth] GOOGLE_CLIENT_ID does not match expected Google OAuth client ID format"
    );
  }

  if (!GOOGLE_CLIENT_SECRET_PATTERN.test(authEnv.googleClientSecret)) {
    throw new Error(
      "[auth] GOOGLE_CLIENT_SECRET does not match expected Google OAuth client secret format"
    );
  }
}

function validateSyntheticCiFixtureScopeOrThrow(authEnv: AuthEnv): void {
  const retiredSyntheticClientId =
    /^[0-9]+-gate-a3-ci\.apps\.googleusercontent\.com$/i.test(authEnv.googleClientId);
  const retiredSyntheticClientSecret =
    /^GOCSPX[-_]gate-a3-ci-placeholder$/.test(authEnv.googleClientSecret);
  if (retiredSyntheticClientId || retiredSyntheticClientSecret) {
    throw new Error(
      "Retired synthetic CI OAuth fixture values are rejected in every environment",
    );
  }

  // Match the runtime-generated, inert fixture by structure without embedding
  // either complete value in the application graph or production artifact.
  const syntheticClientId = authEnv.googleClientId.match(
    /^[0-9]+-gate-a3-ci-([a-f0-9]{32})\.apps\.googleusercontent\.com$/i
  );
  const syntheticClientSecret = authEnv.googleClientSecret.match(
    /^GOCSPX[-_]gate-a3-ci-([a-f0-9]{32})$/i
  );
  const usesSyntheticFixture =
    syntheticClientId || syntheticClientSecret;
  if (!usesSyntheticFixture) return;

  const exactFixture = isSyntheticCiOAuthFixture(authEnv);
  const explicitlyEnabled = process.env.CI_AUTH_FIXTURE_ACTIVE === "1";
  const githubCi = process.env.CI === "true" && process.env.GITHUB_ACTIONS === "true";
  const localPreflight = process.env.CI_AUTH_FIXTURE_LOCAL_TEST === "1";
  const applicationEnvironment = getApplicationEnvironment(process.env);
  const explicitlyNonProduction =
    applicationEnvironment === "development" || applicationEnvironment === "staging";

  if (
    !exactFixture ||
    !explicitlyEnabled ||
    (!githubCi && !localPreflight) ||
    !explicitlyNonProduction
  ) {
    throw new Error(
      "[auth] Synthetic CI OAuth fixture is restricted to explicit non-production CI/test execution"
    );
  }
}

export function getAuthEnvOrThrow(): AuthEnv {
  const env: AuthEnv = {
    authSecret: readAndSanitizeAuthSecretEnv(),
    googleClientId: readAndSanitizeRequiredEnv("GOOGLE_CLIENT_ID"),
    googleClientSecret: readAndSanitizeRequiredEnv("GOOGLE_CLIENT_SECRET"),
  };

  validateAuthShapeOrThrow(env);
  validateSyntheticCiFixtureScopeOrThrow(env);
  return env;
}

export { REQUIRED_AUTH_KEYS };
