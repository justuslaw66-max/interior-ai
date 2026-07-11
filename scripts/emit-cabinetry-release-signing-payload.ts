import { createHash } from "node:crypto";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CabinetryReleaseEvidenceSchema,
  canonicalizeCabinetryReleaseEvidenceForSignature,
} from "./cabinetry-release-evidence";

const DEFAULT_EVIDENCE_PATH = "reports/cabinetry-studio-release-evidence.v2.json";
const UNSIGNED_SIGNATURE_PLACEHOLDER = "AA==";

function usage() {
  return [
    "Usage:",
    "  npm run emit:cabinetry-release-signing-payload -- [evidence.json] --output /secure/path/canonical-evidence.json",
    "",
    "This command emits the exact canonical UTF-8 payload for authorized Ed25519 signing.",
    "Approval metadata must be present; signatureBase64 may be omitted before signing.",
    "It never reads a private key and never produces a signature.",
  ].join("\n");
}

function withUnsignedSignaturePlaceholder(source: unknown): unknown {
  if (typeof source !== "object" || source === null || Array.isArray(source)) {
    return source;
  }

  const document = source as Record<string, unknown>;
  const approval = document.approval;
  if (typeof approval !== "object" || approval === null || Array.isArray(approval)) {
    return source;
  }
  if (Object.prototype.hasOwnProperty.call(approval, "signatureBase64")) {
    return source;
  }

  return {
    ...document,
    approval: {
      ...approval,
      signatureBase64: UNSIGNED_SIGNATURE_PLACEHOLDER,
    },
  };
}

function parseArguments(argv: string[]) {
  let evidencePath = DEFAULT_EVIDENCE_PATH;
  let outputPath: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      process.stdout.write(`${usage()}\n`);
      process.exit(0);
    }
    if (argument === "--output") {
      outputPath = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (argument.startsWith("--")) {
      throw new Error(`Unknown option: ${argument}`);
    }
    evidencePath = argument;
  }

  if (!outputPath) {
    throw new Error("--output is required so the canonical payload is not printed to terminal logs.");
  }

  return {
    evidencePath: resolve(evidencePath),
    outputPath: resolve(outputPath),
  };
}

try {
  const { evidencePath, outputPath } = parseArguments(process.argv.slice(2));
  if (evidencePath === outputPath) {
    throw new Error("The signing payload output must not overwrite the evidence document.");
  }

  const source = JSON.parse(readFileSync(evidencePath, "utf8")) as unknown;
  const evidence = CabinetryReleaseEvidenceSchema.parse(
    withUnsignedSignaturePlaceholder(source)
  );
  if (!evidence.approval) {
    throw new Error("Populate the product-owner approval metadata before emitting the payload.");
  }

  const payload = canonicalizeCabinetryReleaseEvidenceForSignature(evidence);
  writeFileSync(outputPath, payload, { encoding: "utf8", mode: 0o600 });
  chmodSync(outputPath, 0o600);

  const digest = createHash("sha256").update(payload).digest("hex");
  process.stdout.write(`Canonical signing payload: ${outputPath}\n`);
  process.stdout.write(`SHA-256: ${digest}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n\n${usage()}\n`);
  process.exit(2);
}
