import { getApplicationEnvironment } from "@/lib/config";

type AdminCheck = {
  email?: string | null;
};

export function isAdminEmail(email?: string | null) {
  if (!email) return false;
  if (!getApplicationEnvironment()) return false;

  const rawAdminEmails = process.env.ADMIN_EMAILS;
  if (!rawAdminEmails?.trim()) return false;

  const list = rawAdminEmails.split(",").map((entry) => entry.trim().toLowerCase());
  if (list.some((entry) => !/^[^\s,@]+@[^\s,@]+\.[^\s,@]+$/.test(entry))) return false;

  return list.includes(email.trim().toLowerCase());
}

export function canAccessAdmin(email?: string | null) {
  return isAdminEmail(email);
}

export function requireAdmin({ email }: AdminCheck) {
  if (!canAccessAdmin(email)) {
    throw new Error("Admin access required");
  }
}
