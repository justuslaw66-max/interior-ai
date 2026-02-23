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

export function requireAdmin({ email }: AdminCheck) {
  if (!isAdminEmail(email)) {
    throw new Error("Admin access required");
  }
}
