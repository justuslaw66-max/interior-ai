import fs from "node:fs";
import path from "node:path";

function readEnvValue(filePath: string, key: string): string | undefined {
  if (!fs.existsSync(filePath)) return undefined;

  const line = fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .find((candidate) => candidate.trimStart().startsWith(`${key}=`));
  if (!line) return undefined;

  const value = line.slice(line.indexOf("=") + 1).trim();
  if (!value) return undefined;
  return value.replace(/^"|"$/g, "").replace(/^'|'$/g, "");
}

export function getE2EBaseUrl(): string {
  return (
    process.env.PLAYWRIGHT_RELEASE_BASE_URL?.trim() ||
    process.env.PLAYWRIGHT_BASE_URL?.trim() ||
    `http://127.0.0.1:${process.env.PLAYWRIGHT_WEB_SERVER_PORT ?? 3000}`
  ).replace(/\/+$/, "");
}

export function resolveE2EDatabaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const isRemoteRelease = new URL(getE2EBaseUrl()).protocol === "https:";
  const envFiles = isRemoteRelease ? [".env", ".env.local"] : [".env.local", ".env"];

  for (const envFile of envFiles) {
    const value = readEnvValue(
      path.resolve(process.cwd(), envFile),
      "DATABASE_URL",
    );
    if (!value) continue;
    process.env.DATABASE_URL = value;
    return value;
  }

  return undefined;
}

export function resolveE2EAdminEmail(): string {
  const explicitEmail = process.env.PLAYWRIGHT_ADMIN_EMAIL?.trim();
  if (explicitEmail) return explicitEmail;

  const configuredAdminEmails =
    process.env.ADMIN_EMAILS?.trim() ||
    readEnvValue(path.resolve(process.cwd(), ".env"), "ADMIN_EMAILS") ||
    readEnvValue(path.resolve(process.cwd(), ".env.local"), "ADMIN_EMAILS");
  const firstConfiguredEmail = configuredAdminEmails
    ?.split(",")
    .map((email) => email.trim())
    .find(Boolean);

  return firstConfiguredEmail || "gate-a3-admin@example.test";
}
