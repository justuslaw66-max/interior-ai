#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const destinationArg = process.argv[2] ?? process.env.BACKUP_DESTINATION;

if (!destinationArg) {
  console.error("Usage: npm run backup:workspace -- /Volumes/Backup/interior-ai");
  process.exit(1);
}

const destinationRoot = path.resolve(destinationArg.replace(/^~(?=$|\/)/, os.homedir()));
if (destinationRoot === rootDir || destinationRoot.startsWith(`${rootDir}${path.sep}`)) {
  console.error("Backup destination must be outside the project workspace.");
  process.exit(1);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const snapshotRoot = path.join(destinationRoot, timestamp);
const developerRoot = path.dirname(rootDir);
const sources = [
  { source: rootDir, name: "interior-ai" },
  {
    source: path.join(developerRoot, "interior-ai-release-evidence"),
    name: "interior-ai-release-evidence",
  },
  {
    source: path.join(developerRoot, "interior-ai-cabinetry-rc"),
    name: "interior-ai-cabinetry-rc",
  },
  {
    source: path.join(developerRoot, "interior-ai-cabinetry-rc4"),
    name: "interior-ai-cabinetry-rc4",
  },
].filter(({ source }) => fs.existsSync(source));

const excludes = [
  "node_modules",
  "node_modules.*",
  ".next",
  ".next*",
  ".local",
  "playwright-report*",
  "test-results*",
  "coverage",
];

fs.mkdirSync(snapshotRoot, { recursive: true });

for (const { source, name } of sources) {
  const destination = path.join(snapshotRoot, name);
  fs.mkdirSync(destination, { recursive: true });
  const args = ["-a"];
  for (const exclude of excludes) args.push("--exclude", exclude);
  args.push(`${source}${path.sep}`, `${destination}${path.sep}`);

  const result = spawnSync("rsync", args, { stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`Backup failed while copying ${source}`);
    process.exit(result.status ?? 1);
  }
}

fs.writeFileSync(
  path.join(snapshotRoot, "BACKUP-INFO.json"),
  `${JSON.stringify(
    {
      format: "interior_ai.workspace_backup.v1",
      createdAt: new Date().toISOString(),
      sourceRoot: rootDir,
      sources,
      excludedRegenerablePaths: excludes,
    },
    null,
    2
  )}\n`
);

console.log(`Workspace backup completed: ${snapshotRoot}`);
