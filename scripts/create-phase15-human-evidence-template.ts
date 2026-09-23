import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { createPhase15HumanEvidenceTemplate } from "@/lib/phase15-release-evidence";

const outputIndex = process.argv.indexOf("--output");
const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined;
const content = `${JSON.stringify(createPhase15HumanEvidenceTemplate(), null, 2)}\n`;

if (output) {
  const target = resolve(process.cwd(), output);
  writeFileSync(target, content, "utf8");
  console.log(`Created 48-row human evidence template: ${target}`);
} else {
  process.stdout.write(content);
}
