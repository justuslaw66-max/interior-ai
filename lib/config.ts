type AppEnv = "development" | "staging" | "production";

type FeatureFlags = {
  aiEnabled: boolean;
  checkoutEnabled: boolean;
  emailEnabled: boolean;
};

type EnvConfig = {
  appEnv: AppEnv;
  isDev: boolean;
  isStaging: boolean;
  isProd: boolean;
  isProdLike: boolean;
  logLevel: "debug" | "info" | "warn";
  features: FeatureFlags;
};

const normalizeAppEnv = (raw: string | undefined): AppEnv => {
  const value = (raw || "").toLowerCase();
  if (value === "production") return "production";
  if (value === "staging") return "staging";
  return "development";
};

const appEnv = normalizeAppEnv(
  process.env.APP_ENV || process.env.NEXT_PUBLIC_APP_ENV || process.env.VERCEL_ENV || process.env.NODE_ENV
);

const isDev = appEnv === "development";
const isStaging = appEnv === "staging";
const isProd = appEnv === "production";
const isProdLike = isStaging || isProd;

const flagFromEnv = (value: string | undefined, defaultValue: boolean) => {
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === "true" || value === "1";
};

const features: FeatureFlags = {
  aiEnabled: flagFromEnv(process.env.FEATURE_AI, true),
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

const ensureSafeStagingSecrets = (errors: string[]) => {
  if (!config.isStaging) return;

  const stripeKey = process.env.STRIPE_SECRET_KEY || "";
  if (stripeKey.startsWith("sk_live_")) {
    errors.push("STRIPE_SECRET_KEY must use a test key in staging");
  }

  const dbUrl = process.env.DATABASE_URL || "";
  if (/prod/i.test(dbUrl)) {
    errors.push("DATABASE_URL looks like production while APP_ENV=staging");
  }
};

const ensureSafeProdSecrets = (errors: string[]) => {
  if (!config.isProd) return;

  const dbUrl = process.env.DATABASE_URL || "";
  if (/staging/i.test(dbUrl)) {
    errors.push("DATABASE_URL looks like staging while APP_ENV=production");
  }
};

export function validateEnvOrThrow() {
  if (!config.isProdLike) return;

  const missing: string[] = [];

  requireEnv("DATABASE_URL", process.env.DATABASE_URL, missing);
  requireEnv("OPENAI_API_KEY", process.env.OPENAI_API_KEY, missing);
  requireEnv("SHOPIFY_STORE_DOMAIN", process.env.SHOPIFY_STORE_DOMAIN, missing);
  requireEnv(
    "SHOPIFY_STOREFRONT_TOKEN",
    process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN || process.env.SHOPIFY_STOREFRONT_TOKEN,
    missing
  );
  requireEnv("POSTHOG_KEY", process.env.POSTHOG_KEY || process.env.NEXT_PUBLIC_POSTHOG_KEY, missing);
  requireEnv("STRIPE_SECRET_KEY", process.env.STRIPE_SECRET_KEY, missing);
  requireEnv("STRIPE_WEBHOOK_SECRET", process.env.STRIPE_WEBHOOK_SECRET, missing);
  requireEnv("STRIPE_PRICE_PRO_MONTHLY", process.env.STRIPE_PRICE_PRO_MONTHLY, missing);
  requireEnv("STRIPE_PRICE_PRO_YEARLY", process.env.STRIPE_PRICE_PRO_YEARLY, missing);
  requireEnv("AUTH_SECRET", process.env.AUTH_SECRET, missing);
  requireEnv("GOOGLE_CLIENT_ID", process.env.GOOGLE_CLIENT_ID, missing);
  requireEnv("GOOGLE_CLIENT_SECRET", process.env.GOOGLE_CLIENT_SECRET, missing);
  requireEnv("APP_ORIGIN", process.env.APP_ORIGIN, missing);
  requireEnv("ADMIN_EMAILS", process.env.ADMIN_EMAILS, missing);

  const errors: string[] = [];
  if (missing.length) {
    errors.push(`Missing required env vars for ${config.appEnv}: ${missing.join(", ")}`);
  }

  ensureSafeStagingSecrets(errors);
  ensureSafeProdSecrets(errors);

  if (errors.length) {
    throw new Error(errors.join(" | "));
  }
}

export const env = {
  appEnv: config.appEnv,
  logLevel: config.logLevel,
};
