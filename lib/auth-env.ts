type RequiredAuthEnvKey = "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET";

type AuthEnv = {
  authSecret: string;
  googleClientId: string;
  googleClientSecret: string;
};

const CI_FALLBACK_AUTH_ENV: AuthEnv = {
  authSecret: "ci-build-auth-secret-placeholder-1234",
  googleClientId: "123456789012-ci-build.apps.googleusercontent.com",
  googleClientSecret: "GOCSPX-ci-build-secret-placeholder",
};

const REQUIRED_AUTH_KEYS: RequiredAuthEnvKey[] = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
];

const AUTH_SECRET_KEYS = ["AUTH_SECRET", "NEXTAUTH_SECRET"] as const;
type AuthSecretKey = (typeof AUTH_SECRET_KEYS)[number];

const GOOGLE_CLIENT_ID_PATTERN = /^[0-9]+-[a-z0-9-]+\.apps\.googleusercontent\.com$/i;
const GOOGLE_CLIENT_SECRET_PATTERN = /^GOCSPX[-_A-Za-z0-9]+$/;

function isGitHubActionsCiBuild(): boolean {
  return process.env.CI === "true" && process.env.GITHUB_ACTIONS === "true";
}

function getCiFallbackValue(key: "AUTH_SECRET" | RequiredAuthEnvKey): string {
  if (key === "AUTH_SECRET") {
    return CI_FALLBACK_AUTH_ENV.authSecret;
  }

  if (key === "GOOGLE_CLIENT_ID") {
    return CI_FALLBACK_AUTH_ENV.googleClientId;
  }

  return CI_FALLBACK_AUTH_ENV.googleClientSecret;
}

function readAndSanitizeRequiredEnv(key: RequiredAuthEnvKey): string {
  const raw = process.env[key];
  if (raw === undefined || raw === null) {
    if (isGitHubActionsCiBuild()) {
      console.warn(`[auth] ${key} is missing in GitHub Actions CI; using build-only fallback`);
      return getCiFallbackValue(key);
    }

    throw new Error(`[auth] Missing required environment variable: ${key}`);
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    if (isGitHubActionsCiBuild()) {
      console.warn(`[auth] ${key} is empty in GitHub Actions CI; using build-only fallback`);
      return getCiFallbackValue(key);
    }

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
    if (isGitHubActionsCiBuild()) {
      console.warn(
        `[auth] AUTH_SECRET/NEXTAUTH_SECRET empty in GitHub Actions CI; using build-only fallback`
      );
      return getCiFallbackValue("AUTH_SECRET");
    }

    throw new Error(
      `[auth] Environment variable(s) ${emptyKeys.join(", ")} are empty after trimming whitespace`
    );
  }

  if (isGitHubActionsCiBuild()) {
    console.warn(
      `[auth] AUTH_SECRET/NEXTAUTH_SECRET missing in GitHub Actions CI; using build-only fallback`
    );
    return getCiFallbackValue("AUTH_SECRET");
  }

  throw new Error(
    `[auth] Missing required environment variable: AUTH_SECRET (or NEXTAUTH_SECRET)`
  );
}

function validateAuthShapeOrThrow(authEnv: AuthEnv): void {
  if (authEnv.authSecret.length < 16) {
    if (isGitHubActionsCiBuild()) {
      console.warn(
        "[auth] AUTH_SECRET/NEXTAUTH_SECRET is shorter than 16 chars in GitHub Actions CI; allowing build-only usage"
      );
    } else {
      throw new Error("[auth] AUTH_SECRET must be at least 16 characters");
    }
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

export function getAuthEnvOrThrow(): AuthEnv {
  const env: AuthEnv = {
    authSecret: readAndSanitizeAuthSecretEnv(),
    googleClientId: readAndSanitizeRequiredEnv("GOOGLE_CLIENT_ID"),
    googleClientSecret: readAndSanitizeRequiredEnv("GOOGLE_CLIENT_SECRET"),
  };

  validateAuthShapeOrThrow(env);
  return env;
}

export { REQUIRED_AUTH_KEYS };
