import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const boundaries = [
  {
    path: "app/design/page.tsx",
    maximumLines: 30,
  },
  {
    path: "components/editor/design-page/DesignPageWorkspace.tsx",
    maximumLines: 2_500,
  },
];

function countLines(source) {
  if (source.length === 0) return 0;

  const normalized = source.replaceAll("\r\n", "\n");
  return normalized.endsWith("\n")
    ? normalized.slice(0, -1).split("\n").length
    : normalized.split("\n").length;
}

const failures = [];

for (const boundary of boundaries) {
  const lineCount = countLines(readFileSync(join(root, boundary.path), "utf8"));
  const summary = `${boundary.path}: ${lineCount}/${boundary.maximumLines} lines`;

  if (lineCount > boundary.maximumLines) {
    failures.push(summary);
    console.error(`FAIL ${summary}`);
  } else {
    console.log(`PASS ${summary}`);
  }
}

if (failures.length > 0) {
  console.error(
    "\nDesign-page architecture limits are not yet satisfied:\n" +
      failures.map((failure) => `- ${failure}`).join("\n")
  );
  process.exit(1);
}

console.log("\nDesign-page architecture limits passed.");
