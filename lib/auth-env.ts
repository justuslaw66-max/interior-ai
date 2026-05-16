type RequiredAuthEnvKey = "AUTH_SECRET" | "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET";

type AuthEnv = {
  authSecret: string;
  googleClientId: string;
  googleClientSecret: string;
};

const REQUIRED_AUTH_KEYS: RequiredAuthEnvKey[] = [
  "AUTH_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
];

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

export function getAuthEnvOrThrow(): AuthEnv {
  const env: AuthEnv = {
    authSecret: readAndSanitizeRequiredEnv("AUTH_SECRET"),
    googleClientId: readAndSanitizeRequiredEnv("GOOGLE_CLIENT_ID"),
    googleClientSecret: readAndSanitizeRequiredEnv("GOOGLE_CLIENT_SECRET"),
  };

  validateAuthShapeOrThrow(env);
  return env;
}

export { REQUIRED_AUTH_KEYS };
