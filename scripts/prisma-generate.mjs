#!/usr/bin/env node

import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const prismaCli = path.join(rootDir, "node_modules", "prisma", "build", "index.js");
const fallbackDatabaseUrl = "postgresql://prisma:prisma@127.0.0.1:5432/prisma_generate";

const result = spawnSync(process.execPath, [prismaCli, "generate"], {
  cwd: rootDir,
  env: {
    ...process.env,
    DATABASE_URL:
      process.env.DATABASE_URL ??
      process.env.PRISMA_GENERATE_DATABASE_URL ??
      fallbackDatabaseUrl,
  },
  stdio: "inherit",
});

if (result.error) {
  console.error(`Unable to run Prisma generate: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
