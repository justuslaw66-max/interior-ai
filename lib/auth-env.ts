import { getApplicationEnvironment } from "./config";

type RequiredAuthEnvKey = "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET";

type AuthEnv = {
  authSecret: string;
  googleClientId: string;
  googleClientSecret: string;
};

export type AuthEnvironmentFailureCode =
  | "AUTH_PROVIDER_VARIABLE_MISSING"
  | "AUTH_PROVIDER_VARIABLE_EMPTY"
  | "AUTH_SECRET_MISSING"
  | "AUTH_SECRET_EMPTY"
  | "AUTH_SECRET_INVALID"
  | "AUTH_PROVIDER_CLIENT_ID_GRAMMAR_INVALID"
  | "AUTH_PROVIDER_CLIENT_SECRET_GRAMMAR_INVALID"
  | "RETIRED_SYNTHETIC_AUTH_FIXTURE_REJECTED"
  | "SYNTHETIC_AUTH_FIXTURE_SCOPE_REJECTED"
  | "SYNTHETIC_AUTH_FIXTURE_PRODUCTION_MISUSE_REJECTED";

export class AuthEnvironmentValidationError extends Error {
  readonly safeCode: AuthEnvironmentFailureCode;
  readonly category: string;

  constructor(safeCode: AuthEnvironmentFailureCode, category: string, message: string) {
    super(message);
    this.name = "AuthEnvironmentValidationError";
    this.safeCode = safeCode;
    this.category = category;
  }
}

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

function readAndSanitizeRequiredEnv(
  key: RequiredAuthEnvKey,
  environment: NodeJS.ProcessEnv,
): string {
  const raw = environment[key];
  if (raw === undefined || raw === null) {
    throw new AuthEnvironmentValidationError(
      "AUTH_PROVIDER_VARIABLE_MISSING",
      "provider-presence",
      `[auth] Missing required environment variable: ${key}`,
    );
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    throw new AuthEnvironmentValidationError(
      "AUTH_PROVIDER_VARIABLE_EMPTY",
      "provider-presence",
      `[auth] Environment variable ${key} is empty after trimming whitespace`,
    );
  }

  if (raw !== trimmed) {
    // Prevent hard-to-debug OAuth failures caused by accidental newlines/spaces.
    console.warn(`[auth] ${key} contained surrounding whitespace and was trimmed`);
  }

  return trimmed;
}

function readAndSanitizeAuthSecretEnv(environment: NodeJS.ProcessEnv): string {
  const emptyKeys: AuthSecretKey[] = [];

  for (const key of AUTH_SECRET_KEYS) {
    const raw = environment[key];
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
    throw new AuthEnvironmentValidationError(
      "AUTH_SECRET_EMPTY",
      "auth-secret-presence",
      `[auth] Environment variable(s) ${emptyKeys.join(", ")} are empty after trimming whitespace`,
    );
  }

  throw new AuthEnvironmentValidationError(
    "AUTH_SECRET_MISSING",
    "auth-secret-presence",
    `[auth] Missing required environment variable: AUTH_SECRET (or NEXTAUTH_SECRET)`,
  );
}

function validateAuthShapeOrThrow(authEnv: AuthEnv): void {
  if (authEnv.authSecret.length < 16) {
    throw new AuthEnvironmentValidationError(
      "AUTH_SECRET_INVALID",
      "auth-secret-grammar",
      "[auth] AUTH_SECRET must be at least 16 characters",
    );
  }

  if (!GOOGLE_CLIENT_ID_PATTERN.test(authEnv.googleClientId)) {
    throw new AuthEnvironmentValidationError(
      "AUTH_PROVIDER_CLIENT_ID_GRAMMAR_INVALID",
      "provider-client-id-grammar",
      "[auth] GOOGLE_CLIENT_ID does not match expected Google OAuth client ID format",
    );
  }

  if (!GOOGLE_CLIENT_SECRET_PATTERN.test(authEnv.googleClientSecret)) {
    throw new AuthEnvironmentValidationError(
      "AUTH_PROVIDER_CLIENT_SECRET_GRAMMAR_INVALID",
      "provider-client-secret-grammar",
      "[auth] GOOGLE_CLIENT_SECRET does not match expected Google OAuth client secret format",
    );
  }
}

function validateSyntheticCiFixtureScopeOrThrow(
  authEnv: AuthEnv,
  environment: NodeJS.ProcessEnv,
): void {
  const retiredSyntheticClientId =
    /^[0-9]+-gate-a3-ci\.apps\.googleusercontent\.com$/i.test(authEnv.googleClientId);
  const retiredSyntheticClientSecret =
    /^GOCSPX[-_]gate-a3-ci-placeholder$/.test(authEnv.googleClientSecret);
  if (retiredSyntheticClientId || retiredSyntheticClientSecret) {
    throw new AuthEnvironmentValidationError(
      "RETIRED_SYNTHETIC_AUTH_FIXTURE_REJECTED",
      "synthetic-fixture-policy",
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
  const explicitlyEnabled = environment.CI_AUTH_FIXTURE_ACTIVE === "1";
  const githubCi = environment.CI === "true" && environment.GITHUB_ACTIONS === "true";
  const localPreflight = environment.CI_AUTH_FIXTURE_LOCAL_TEST === "1";
  const applicationEnvironment = getApplicationEnvironment(environment);
  const explicitlyNonProduction =
    applicationEnvironment === "development" || applicationEnvironment === "staging";

  if (
    !exactFixture ||
    !explicitlyEnabled ||
    (!githubCi && !localPreflight) ||
    !explicitlyNonProduction
  ) {
    throw new AuthEnvironmentValidationError(
      applicationEnvironment === "production"
        ? "SYNTHETIC_AUTH_FIXTURE_PRODUCTION_MISUSE_REJECTED"
        : "SYNTHETIC_AUTH_FIXTURE_SCOPE_REJECTED",
      applicationEnvironment === "production"
        ? "production-activation-prohibited"
        : "synthetic-fixture-scope",
      "[auth] Synthetic CI OAuth fixture is restricted to explicit non-production CI/test execution"
    );
  }
}

export function getAuthEnvOrThrow(environment: NodeJS.ProcessEnv = process.env): AuthEnv {
  const env: AuthEnv = {
    authSecret: readAndSanitizeAuthSecretEnv(environment),
    googleClientId: readAndSanitizeRequiredEnv("GOOGLE_CLIENT_ID", environment),
    googleClientSecret: readAndSanitizeRequiredEnv("GOOGLE_CLIENT_SECRET", environment),
  };

  validateAuthShapeOrThrow(env);
  validateSyntheticCiFixtureScopeOrThrow(env, environment);
  return env;
}

export { REQUIRED_AUTH_KEYS };
