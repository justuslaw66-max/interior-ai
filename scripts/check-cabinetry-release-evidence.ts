import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  formatCabinetryReleaseEvidenceMatrix,
  validateCabinetryReleaseEvidence,
} from "./cabinetry-release-evidence";

const DEFAULT_EVIDENCE_PATH = "reports/cabinetry-studio-release-evidence.v2.json";

function usage() {
  return [
    "Usage: npm run check:cabinetry-release-evidence -- [evidence.json] [--report-only] [--trusted-public-key path] [--trusted-key-id id]",
    "",
    "Without --report-only, exits 1 until evidence is complete and its Ed25519 product-owner approval verifies.",
    "--report-only keeps a structurally valid incomplete/unapproved matrix at exit 0.",
    "Key defaults: CABINETRY_RELEASE_PRODUCT_OWNER_PUBLIC_KEY_PATH and CABINETRY_RELEASE_PRODUCT_OWNER_KEY_ID.",
    "Malformed evidence always exits 2.",
  ].join("\n");
}

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(usage());
  process.exit(0);
}

const reportOnly = args.includes("--report-only");
function optionValue(name: string) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  return value && !value.startsWith("--") ? value : undefined;
}
const keyPath =
  optionValue("--trusted-public-key") ??
  process.env.CABINETRY_RELEASE_PRODUCT_OWNER_PUBLIC_KEY_PATH;
const keyId =
  optionValue("--trusted-key-id") ?? process.env.CABINETRY_RELEASE_PRODUCT_OWNER_KEY_ID;
const valueIndexes = new Set<number>();
for (const name of ["--trusted-public-key", "--trusted-key-id"]) {
  const index = args.indexOf(name);
  if (index >= 0) {
    valueIndexes.add(index);
    if (optionValue(name)) valueIndexes.add(index + 1);
  }
}
const positional = args.filter(
  (arg, index) => !arg.startsWith("--") && !valueIndexes.has(index)
);
const knownFlags = new Set([
  "--report-only",
  "--trusted-public-key",
  "--trusted-key-id",
]);
const unknownFlags = args.filter((arg) => arg.startsWith("--") && !knownFlags.has(arg));
const missingOptionValue = ["--trusted-public-key", "--trusted-key-id"].some(
  (name) => args.includes(name) && !optionValue(name)
);
if (positional.length > 1 || unknownFlags.length > 0 || missingOptionValue) {
  console.error(usage());
  process.exit(2);
}

const evidencePath = resolve(process.cwd(), positional[0] ?? DEFAULT_EVIDENCE_PATH);

let input: unknown;
try {
  input = JSON.parse(readFileSync(evidencePath, "utf8")) as unknown;
} catch (error) {
  console.error(`Unable to read release evidence: ${evidencePath}`);
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}

let trustedProductOwnerPublicKey: Buffer | undefined;
if (keyPath) {
  try {
    trustedProductOwnerPublicKey = readFileSync(resolve(process.cwd(), keyPath));
  } catch (error) {
    console.error(`Unable to read trusted product-owner public key: ${keyPath}`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }
}

const result = validateCabinetryReleaseEvidence(input, {
  repositoryRoot: process.cwd(),
  trustedProductOwnerPublicKey,
  trustedProductOwnerKeyId: keyId,
});
console.log(formatCabinetryReleaseEvidenceMatrix(result));
console.log(`\nEvidence file: ${evidencePath}`);
console.log(
  "Release readiness requires readable hashed local source artifacts and a trusted product-owner Ed25519 signature over the canonical evidence payload."
);

if (!result.structurallyValid) {
  process.exit(2);
}
if (!result.releaseReady && !reportOnly) {
  process.exit(1);
}
