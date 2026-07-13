import { config } from "@/lib/config";

type AdminCheck = {
  email?: string | null;
};

export function isAdminEmail(email?: string | null) {
  if (!email) return false;
  const list = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (config.isDev && list.length === 0) return true;

  return list.includes(email.toLowerCase());
}

export function canAccessAdmin(email?: string | null) {
  if (isAdminEmail(email)) return true;

  return (
    config.isDev &&
    process.env.NODE_ENV === "development" &&
    process.env.ADMIN_REQUIRE_AUTH !== "true"
  );
}

export function requireAdmin({ email }: AdminCheck) {
  if (!canAccessAdmin(email)) {
    throw new Error("Admin access required");
  }
}
