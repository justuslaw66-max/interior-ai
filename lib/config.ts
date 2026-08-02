export type AppEnv = "development" | "staging" | "production";

type DeploymentEnvironment = Readonly<Record<string, string | undefined>>;

type FeatureFlags = {
  aiEnabled: boolean;
  cabinetryStudioEnabled: boolean;
  customMillworkStudioEnabled: boolean;
  checkoutEnabled: boolean;
  emailEnabled: boolean;
};

type EnvConfig = {
  appEnv: AppEnv | null;
  isDev: boolean;
  isStaging: boolean;
  isProd: boolean;
  isProdLike: boolean;
  logLevel: "debug" | "info" | "warn";
  features: FeatureFlags;
};

const normalizeApplicationEnvironment = (raw: string | undefined): AppEnv | null => {
  const value = raw?.trim().toLowerCase();
  if (value === "development" || value === "staging" || value === "production") return value;
  return null;
};

export function getApplicationEnvironment(
  environment: DeploymentEnvironment = process.env
): AppEnv | null {
  if (environment.APP_ENV !== undefined) {
    return normalizeApplicationEnvironment(environment.APP_ENV);
  }

  if (environment.VERCEL_ENV === undefined) return null;

  const vercelEnvironment = environment.VERCEL_ENV.trim().toLowerCase();
  if (vercelEnvironment === "preview") return "staging";
  if (vercelEnvironment === "development" || vercelEnvironment === "production") {
    return vercelEnvironment;
  }

  return null;
}

export function validateDeploymentEnvironmentOrThrow(
  environment: DeploymentEnvironment = process.env
): AppEnv {
  const resolved = getApplicationEnvironment(environment);
  if (!resolved) {
    throw new Error(
      "[config] APP_ENV or VERCEL_ENV must explicitly identify a recognized deployment environment"
    );
  }
  return resolved;
}

const appEnv = getApplicationEnvironment();

const isDev = appEnv === "development";
const isStaging = appEnv === "staging";
const isProd = appEnv === "production";
const isProdLike = isStaging || isProd;

const flagFromEnv = (value: string | undefined, defaultValue: boolean) => {
  if (value === undefined) return defaultValue;
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1";
};

const features: FeatureFlags = {
  aiEnabled: flagFromEnv(process.env.FEATURE_AI, true),
  cabinetryStudioEnabled: flagFromEnv(
    process.env.FEATURE_CUSTOM_MILLWORK_STUDIO ||
      process.env.NEXT_PUBLIC_FEATURE_CUSTOM_MILLWORK_STUDIO ||
      process.env.FEATURE_CABINETRY_STUDIO ||
      process.env.NEXT_PUBLIC_FEATURE_CABINETRY_STUDIO,
    isDev || isStaging
  ),
  customMillworkStudioEnabled: flagFromEnv(
    process.env.FEATURE_CUSTOM_MILLWORK_STUDIO ||
      process.env.NEXT_PUBLIC_FEATURE_CUSTOM_MILLWORK_STUDIO ||
      process.env.FEATURE_CABINETRY_STUDIO ||
      process.env.NEXT_PUBLIC_FEATURE_CABINETRY_STUDIO,
    isDev || isStaging
  ),
  checkoutEnabled: flagFromEnv(process.env.FEATURE_CHECKOUT, true),
  emailEnabled: flagFromEnv(process.env.FEATURE_EMAIL, true),
};

const logLevel: EnvConfig["logLevel"] = isDev ? "debug" : isStaging ? "info" : "warn";

export const config: EnvConfig = {
  appEnv,
  isDev,
  isStaging,
  isProd,
  isProdLike,
  logLevel,
  features,
};

const requireEnv = (key: string, value: string | undefined, missing: string[]) => {
  if (!value || value.trim() === "") {
    missing.push(key);
  }
};

const ensureSafeStagingSecrets = (environment: NodeJS.ProcessEnv, errors: string[]) => {
  const stripeKey = environment.STRIPE_SECRET_KEY || "";

  if (stripeKey.startsWith("sk_live_")) {
    errors.push("STRIPE_SECRET_KEY must use a test key in staging");
  }

  const dbUrl = environment.DATABASE_URL || "";
  if (/prod/i.test(dbUrl)) {
    errors.push("DATABASE_URL looks like production while APP_ENV=staging");
  }
};

const ensureSafeProdSecrets = (environment: NodeJS.ProcessEnv, errors: string[]) => {
  const dbUrl = environment.DATABASE_URL || "";
  if (/staging/i.test(dbUrl)) {
    errors.push("DATABASE_URL looks like staging while APP_ENV=production");
  }
};

export function validateEnvOrThrow(environment: NodeJS.ProcessEnv = process.env) {
  const validatedAppEnv = validateDeploymentEnvironmentOrThrow(environment);
  if (validatedAppEnv === "development") return;

  const missing: string[] = [];

  requireEnv("DATABASE_URL", environment.DATABASE_URL, missing);
  requireEnv("OPENAI_API_KEY", environment.OPENAI_API_KEY, missing);
  requireEnv("SHOPIFY_STORE_DOMAIN", environment.SHOPIFY_STORE_DOMAIN, missing);
  requireEnv(
    "SHOPIFY_STOREFRONT_TOKEN",
    environment.SHOPIFY_STOREFRONT_ACCESS_TOKEN || environment.SHOPIFY_STOREFRONT_TOKEN,
    missing
  );
  requireEnv("POSTHOG_KEY", environment.POSTHOG_KEY || environment.NEXT_PUBLIC_POSTHOG_KEY, missing);
  requireEnv("STRIPE_SECRET_KEY", environment.STRIPE_SECRET_KEY, missing);
  requireEnv("STRIPE_WEBHOOK_SECRET", environment.STRIPE_WEBHOOK_SECRET, missing);
  requireEnv("STRIPE_PRICE_PRO_MONTHLY", environment.STRIPE_PRICE_PRO_MONTHLY, missing);
  requireEnv("STRIPE_PRICE_PRO_YEARLY", environment.STRIPE_PRICE_PRO_YEARLY, missing);
  requireEnv("AUTH_SECRET", environment.AUTH_SECRET, missing);
  requireEnv("GOOGLE_CLIENT_ID", environment.GOOGLE_CLIENT_ID, missing);
  requireEnv("GOOGLE_CLIENT_SECRET", environment.GOOGLE_CLIENT_SECRET, missing);
  requireEnv("APP_ORIGIN", environment.APP_ORIGIN, missing);
  requireEnv("ADMIN_EMAILS", environment.ADMIN_EMAILS, missing);

  const errors: string[] = [];
  if (missing.length) {
    errors.push(`Missing required env vars for ${validatedAppEnv}: ${missing.join(", ")}`);
  }

  if (validatedAppEnv === "staging") ensureSafeStagingSecrets(environment, errors);
  if (validatedAppEnv === "production") ensureSafeProdSecrets(environment, errors);

  if (errors.length) {
    throw new Error(errors.join(" | "));
  }
}

export const env = {
  appEnv: config.appEnv,
  logLevel: config.logLevel,
};
