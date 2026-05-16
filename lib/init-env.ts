// Initialize environment variables at module load time
// This runs BEFORE anything else that might need DATABASE_URL

import fs from "fs";
import path from "path";
import { CATALOG_ITEMS } from "@/lib/catalog";
import { CatalogValidator } from "@/lib/catalog-validation";

export function initializeEnvironment() {
  const appEnv = (process.env.APP_ENV || process.env.NODE_ENV || "development").toLowerCase();
  // If DATABASE_URL is already loaded, we're good
  if (process.env.DATABASE_URL) {
    console.log("[Init] DATABASE_URL already in process.env");
    return;
  }

  // Try to find and load .env.local
  const possibleEnvPaths = [
    path.resolve(process.cwd(), `.env.${appEnv}`),
    path.resolve(process.cwd(), ".env.local"),
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "interior-ai", ".env.local"),
    path.resolve(process.cwd(), "interior-ai", `.env.${appEnv}`),
    path.join(__dirname, "..", ".env.local"),
    path.join(__dirname, "..", `.env.${appEnv}`),
    path.join(__dirname, "..", ".env"),
  ];

  for (const envPath of possibleEnvPaths) {
    try {
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, "utf-8");
        const lines = envContent.split("\n");

        for (const line of lines) {
          if (!line.startsWith("#") && line.includes("=")) {
            const [key, ...valueParts] = line.split("=");
            const trimmedKey = key.trim();
            const value = valueParts.join("=").trim().replace(/^["']|["']$/g, "");

            if (trimmedKey && value) {
              process.env[trimmedKey] = value;
            }
          }
        }

        console.log(`[Init] Loaded environment from ${envPath}`);
        if (process.env.DATABASE_URL) {
          console.log("[Init] DATABASE_URL is now set");
          return;
        }
      }
    } catch {
      // Try next path
      continue;
    }
  }

  console.warn("[Init] Could not load .env.local from any path");
}

export function initializeCatalog() {
  const validator = new CatalogValidator();
  const validation = validator.validateCatalog(CATALOG_ITEMS);

  console.log(`📦 Catalog Status:`);
  console.log(`   Total: ${validation.summary.total}`);
  console.log(`   Valid: ${validation.summary.valid}`);
  console.log(`   Errors: ${validation.summary.total - validation.summary.valid}`);

  if (!validation.valid) {
    console.warn(`\n⚠️  Catalog validation found issues:`);
    for (const detail of validation.details) {
      if (detail.errors.length > 0) {
        console.warn(`   ${detail.itemId}: ${detail.errors.join(", ")}`);
      }
    }
  } else {
    console.log(`\n✅ Catalog passed validation`);
  }

  return validation;
}

// Run immediately on import
initializeEnvironment();
