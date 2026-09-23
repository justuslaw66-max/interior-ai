function flagFromPublicEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1";
}

function normalizePublicAppEnv(raw: string | undefined): "production" | "staging" | "development" {
  const value = (raw || "").trim().toLowerCase();
  if (value === "production") return "production";
  if (value === "staging") return "staging";
  return "development";
}

const publicAppEnv = normalizePublicAppEnv(
  process.env.NEXT_PUBLIC_APP_ENV || process.env.VERCEL_ENV
);

export const CABINETRY_STUDIO_FEATURE_ENABLED = flagFromPublicEnv(
  process.env.NEXT_PUBLIC_FEATURE_CUSTOM_MILLWORK_STUDIO ||
    process.env.NEXT_PUBLIC_FEATURE_CABINETRY_STUDIO,
  publicAppEnv !== "production"
);
