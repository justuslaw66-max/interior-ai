import fs from "node:fs/promises";
import path from "node:path";
import { collectWorkingTreeIdentity } from "./window-opening-evidence-manifest.mjs";

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--output" || !args[1]) {
  throw new Error("Usage: node scripts/capture-window-opening-source-identity.mjs --output <path>");
}
const outputPath = path.resolve(args[1]);
const identity = await collectWorkingTreeIdentity(process.cwd());
await fs.writeFile(outputPath, `${JSON.stringify(identity, null, 2)}\n`, {
  flag: "wx",
  mode: 0o644,
});
console.log(JSON.stringify({
  outputPath,
  completeStateIdentitySha256: identity.completeStateIdentitySha256,
}, null, 2));
