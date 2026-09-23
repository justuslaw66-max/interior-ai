import { readFileSync } from "node:fs";
import path from "node:path";

import {
  PRODUCTION_CERTIFICATION_STATE_SCHEMA_V1,
  PRODUCTION_CERTIFICATION_STATE_SCHEMA_V2,
  canonicalJsonBytes,
  sha256Bytes,
} from "./production-certification-contract.mjs";

export const HISTORICAL_PRODUCTION_EVIDENCE_JOURNAL_SCHEMA =
  "interior-ai.production-artifact-semantic-event-journal.v1";
export const HISTORICAL_PRODUCTION_EVIDENCE_JOURNAL_VERSION = 1;

const HISTORICAL_STATE_SCHEMAS = new Set([
  PRODUCTION_CERTIFICATION_STATE_SCHEMA_V1,
  PRODUCTION_CERTIFICATION_STATE_SCHEMA_V2,
]);

export function isHistoricalCertificationStateSchemaSupported(schema) {
  return HISTORICAL_STATE_SCHEMAS.has(schema);
}

export function historicalJournalV1Issues(journal) {
  const keys =
    journal && typeof journal === "object" && !Array.isArray(journal)
      ? Object.keys(journal).sort()
      : [];
  if (JSON.stringify(keys) !== JSON.stringify(["runNonce", "schema"])) {
    return ["historical semantic journal v1 shape is malformed"];
  }
  const issues = [];
  if (journal.schema !== HISTORICAL_PRODUCTION_EVIDENCE_JOURNAL_SCHEMA) {
    issues.push("historical semantic journal schema is unsupported");
  }
  if (typeof journal.runNonce !== "string" || journal.runNonce.length === 0) {
    issues.push("historical semantic journal nonce is missing");
  }
  return issues;
}

export function historicalRuntimeArtifactIdentityIssues(identity, state) {
  if (
    !isHistoricalCertificationStateSchemaSupported(state?.schema) ||
    identity?.candidateIdentifier !== state.candidate.id ||
    identity?.sourceCommitSha !== state.candidate.commitSha ||
    identity?.sourceTreeSha !== state.candidate.treeSha ||
    identity?.artifactSha256 !== state.bindings.artifactSha256 ||
    identity?.nextBuildId !== state.bindings.nextBuildId ||
    identity?.runNonce !== state.bindings.semanticJournalNonce ||
    identity?.semanticJournalSchema !==
      HISTORICAL_PRODUCTION_EVIDENCE_JOURNAL_SCHEMA ||
    identity?.semanticJournalVersion !==
      HISTORICAL_PRODUCTION_EVIDENCE_JOURNAL_VERSION ||
    identity?.serverCommand !== "npm run evidence:production:serve" ||
    identity?.buildMode !== "production"
  ) {
    return ["historical runtime report identity is invalid"];
  }
  return [];
}

export function historicalCertificationManifestIdentityIssues(
  manifestRead,
  artifactRoot,
  state,
) {
  const issues = [];
  if (!isHistoricalCertificationStateSchemaSupported(state?.schema)) {
    return ["historical certification state schema is unsupported"];
  }
  const manifest = manifestRead.value;
  if (
    manifest?.schema !== "interior-ai.production-artifact-evidence.v3" ||
    manifest?.candidateIdentifier !== state.candidate.id ||
    manifest?.source?.commitSha !== state.candidate.commitSha ||
    manifest?.source?.treeSha !== state.candidate.treeSha ||
    manifest?.build?.nextBuildId !== state.bindings.nextBuildId ||
    manifest?.artifact?.sha256 !== state.bindings.artifactSha256 ||
    manifest?.execution?.runNonce !== state.bindings.semanticJournalNonce ||
    manifestRead.sha256 !== state.bindings.productionManifestSha256
  ) {
    issues.push("historical production manifest identity is invalid");
  }
  let journalBytes;
  let journal;
  try {
    journalBytes = readFileSync(
      path.join(
        artifactRoot,
        ".local/production-artifact-evidence/semantic-event-journal.json",
      ),
    );
    journal = JSON.parse(journalBytes.toString("utf8"));
  } catch {
    return [...issues, "historical semantic journal v1 is missing or invalid"];
  }
  if (!journalBytes.equals(canonicalJsonBytes(journal))) {
    issues.push("historical semantic journal v1 is not canonical JSON");
  }
  issues.push(...historicalJournalV1Issues(journal));
  if (
    journal.runNonce !== state.bindings.semanticJournalNonce ||
    sha256Bytes(journalBytes) !== state.bindings.semanticJournalSha256
  ) {
    issues.push("historical semantic journal v1 identity is invalid");
  }
  return issues;
}
