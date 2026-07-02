export type CheckoutBoundaryStage = "production" | "staging" | "preview" | "development" | "test" | "unknown";
export type SecretMode = "live" | "test" | "missing" | "placeholder" | "unknown";
export type DatabaseBoundary = "production-like" | "staging-like" | "development-like" | "missing" | "unknown";

export type CheckoutBoundaryDiagnostics = {
  appStage: CheckoutBoundaryStage;
  vercelEnv: string | null;
  stripeSecretMode: SecretMode;
  stripePublishableMode: SecretMode;
  databaseBoundary: DatabaseBoundary;
  checkoutSafe: boolean;
  warnings: string[];
  hardStops: string[];
};

const CHECKOUT_FAILURE_HARD_STOP =
  "Checkout provider connectivity could not be verified in staging or preview.";

type EnvLike = Record<string, string | undefined>;

function normalizeStage(value: string | undefined): CheckoutBoundaryStage | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  if (["prod", "production"].includes(normalized)) return "production";
  if (["staging", "stage"].includes(normalized)) return "staging";
  if (["preview", "vercel-preview"].includes(normalized)) return "preview";
  if (["dev", "development", "local"].includes(normalized)) return "development";
  if (normalized === "test") return "test";
  return "unknown";
}

function resolveStage(env: EnvLike): CheckoutBoundaryStage {
  return (
    normalizeStage(env.APP_ENV) ??
    normalizeStage(env.NEXT_PUBLIC_APP_ENV) ??
    normalizeStage(env.VERCEL_ENV) ??
    normalizeStage(env.NODE_ENV) ??
    "unknown"
  );
}

function resolveSecretMode(value: string | undefined): SecretMode {
  if (!value) return "missing";
  if (value.includes("...") || /changeme|placeholder|example/i.test(value)) return "placeholder";
  if (/^(sk|pk|rk)_live_/.test(value)) return "live";
  if (/^(sk|pk|rk)_test_/.test(value)) return "test";
  return "unknown";
}

function resolveDatabaseBoundary(value: string | undefined): DatabaseBoundary {
  if (!value) return "missing";
  const normalized = value.toLowerCase();
  if (/\b(prod|production|primary)\b/.test(normalized) || /prod[-_]/.test(normalized)) {
    return "production-like";
  }
  if (/\b(stage|staging|preview|beta)\b/.test(normalized)) return "staging-like";
  if (/localhost|127\.0\.0\.1|file:|dev|development|shadow/.test(normalized)) {
    return "development-like";
  }
  return "unknown";
}

function isBetaBoundary(stage: CheckoutBoundaryStage, vercelEnv: string | undefined): boolean {
  const normalizedVercelEnv = vercelEnv?.trim().toLowerCase();
  return stage === "staging" || stage === "preview" || normalizedVercelEnv === "preview";
}

export function isBetaCheckoutBoundary(diagnostics: CheckoutBoundaryDiagnostics): boolean {
  return (
    diagnostics.appStage === "staging" ||
    diagnostics.appStage === "preview" ||
    diagnostics.vercelEnv?.trim().toLowerCase() === "preview"
  );
}

export function resolveCheckoutBoundaryDiagnostics(
  env: EnvLike = process.env
): CheckoutBoundaryDiagnostics {
  const appStage = resolveStage(env);
  const vercelEnv = env.VERCEL_ENV?.trim() || null;
  const stripeSecretMode = resolveSecretMode(env.STRIPE_SECRET_KEY);
  const stripePublishableMode = resolveSecretMode(env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
  const databaseBoundary = resolveDatabaseBoundary(env.DATABASE_URL);
  const betaBoundary = isBetaBoundary(appStage, env.VERCEL_ENV);
  const hardStops: string[] = [];
  const warnings: string[] = [];

  if (betaBoundary && stripeSecretMode === "live") {
    hardStops.push("Live Stripe secret key is not allowed in staging or preview checkout.");
  }
  if (betaBoundary && stripePublishableMode === "live") {
    hardStops.push("Live Stripe publishable key is not allowed in staging or preview checkout.");
  }
  if (betaBoundary && databaseBoundary === "production-like") {
    hardStops.push("Production-like DATABASE_URL is not allowed in staging or preview checkout.");
  }
  if (appStage === "production" && stripeSecretMode === "test") {
    hardStops.push("Stripe test secret key is not allowed in production checkout.");
  }

  if (appStage === "unknown") {
    warnings.push("APP_ENV/NEXT_PUBLIC_APP_ENV/VERCEL_ENV is not explicit.");
  }
  if (stripeSecretMode === "missing" || stripeSecretMode === "placeholder") {
    warnings.push("Stripe secret key is not configured for paid checkout.");
  }
  if (databaseBoundary === "missing") {
    warnings.push("DATABASE_URL is missing, so checkout persistence cannot be verified.");
  }
  if (betaBoundary && stripeSecretMode !== "test" && stripeSecretMode !== "missing") {
    warnings.push("Staging checkout should use Stripe test credentials.");
  }

  return {
    appStage,
    vercelEnv,
    stripeSecretMode,
    stripePublishableMode,
    databaseBoundary,
    checkoutSafe: hardStops.length === 0,
    warnings,
    hardStops,
  };
}

export function buildCheckoutBoundaryResponsePayload(diagnostics: CheckoutBoundaryDiagnostics) {
  return {
    error: "Checkout boundary blocked this request",
    diagnostics: {
      appStage: diagnostics.appStage,
      vercelEnv: diagnostics.vercelEnv,
      stripeSecretMode: diagnostics.stripeSecretMode,
      stripePublishableMode: diagnostics.stripePublishableMode,
      databaseBoundary: diagnostics.databaseBoundary,
      warnings: diagnostics.warnings,
      hardStops: diagnostics.hardStops,
    },
  };
}

export function buildProviderFailureBoundaryDiagnostics(
  diagnostics: CheckoutBoundaryDiagnostics,
  provider: "stripe" | "shopify",
  message?: string
): CheckoutBoundaryDiagnostics {
  const providerLabel = provider === "stripe" ? "Stripe" : "Shopify";
  const hardStop = CHECKOUT_FAILURE_HARD_STOP;
  const warning = message
    ? `${providerLabel} checkout failed before a checkout URL was created: ${message}`
    : `${providerLabel} checkout failed before a checkout URL was created.`;

  return {
    ...diagnostics,
    checkoutSafe: false,
    hardStops: diagnostics.hardStops.includes(hardStop)
      ? diagnostics.hardStops
      : [...diagnostics.hardStops, hardStop],
    warnings: diagnostics.warnings.includes(warning)
      ? diagnostics.warnings
      : [...diagnostics.warnings, warning],
  };
}
