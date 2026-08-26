import { createHash } from "node:crypto";

export const CERTIFICATION_APP_EVENT_BINDING_KEY =
  "certificationRunBinding" as const;

const BINDING_SCHEMA =
  "interior-ai.production-certification-app-event-binding.v1";
const SOURCE_SHA = /^[0-9a-f]{40,64}$/;
const IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const BROWSER_OWNER = /^[a-z0-9][a-z0-9-]{0,63}$/;

export type CertificationAppEventWriterClassification =
  | "browser-public-ingestion"
  | "browser-server-action"
  | "internal-server-diagnostic"
  | "trusted-stripe-lifecycle";

type CertificationAppEventEnvironment = Readonly<
  Record<string, string | undefined>
>;

type CertificationAppEventBinding = {
  schema: typeof BINDING_SCHEMA;
  certificationId: string;
  candidateId: string;
  commitSha: string;
  treeSha: string;
  stage: "runtime-smoke" | "browser-owners";
  stageAttempt: number;
  browserOwnerId: string | null;
  writerClassification: CertificationAppEventWriterClassification;
  runIdentitySha256: string;
};

function required(
  environment: CertificationAppEventEnvironment,
  name: string,
  pattern: RegExp
): string {
  const value = environment[name]?.trim();
  if (!value || !pattern.test(value)) {
    throw new Error(`certification AppEvent binding requires valid ${name}`);
  }
  return value;
}

function stageAttempt(
  environment: CertificationAppEventEnvironment,
  name: string
): number {
  const raw = required(environment, name, /^\d+$/);
  const attempt = Number(raw);
  if (!Number.isSafeInteger(attempt) || attempt < 1) {
    throw new Error("certification AppEvent stage attempt is malformed");
  }
  return attempt;
}

function runIdentitySha256(
  binding: Omit<CertificationAppEventBinding, "runIdentitySha256">
): string {
  return createHash("sha256")
    .update(
      `${JSON.stringify([
        binding.schema,
        binding.certificationId,
        binding.candidateId,
        binding.commitSha,
        binding.treeSha,
        binding.stage,
        binding.stageAttempt,
        binding.browserOwnerId,
        binding.writerClassification,
      ])}\n`
    )
    .digest("hex");
}

function runtimeStageBinding(
  environment: CertificationAppEventEnvironment
): Pick<
  CertificationAppEventBinding,
  | "candidateId"
  | "commitSha"
  | "treeSha"
  | "stage"
  | "stageAttempt"
  | "browserOwnerId"
> {
  return {
    candidateId: required(
      environment,
      "PRODUCTION_EVIDENCE_CANDIDATE_ID",
      IDENTITY
    ),
    commitSha: required(
      environment,
      "PRODUCTION_EVIDENCE_EXPECTED_COMMIT_SHA",
      SOURCE_SHA
    ),
    treeSha: required(
      environment,
      "PRODUCTION_EVIDENCE_EXPECTED_TREE_SHA",
      SOURCE_SHA
    ),
    stage: "runtime-smoke",
    stageAttempt: stageAttempt(
      environment,
      "CERTIFICATION_RUNTIME_STAGE_ATTEMPT"
    ),
    browserOwnerId: null,
  };
}

function browserStageBinding(
  environment: CertificationAppEventEnvironment
): Pick<
  CertificationAppEventBinding,
  | "candidateId"
  | "commitSha"
  | "treeSha"
  | "stage"
  | "stageAttempt"
  | "browserOwnerId"
> {
  return {
    candidateId: required(
      environment,
      "REQUIRED_TEST_RELEASE_CANDIDATE_ID",
      IDENTITY
    ),
    commitSha: required(
      environment,
      "REQUIRED_TEST_SOURCE_COMMIT_SHA",
      SOURCE_SHA
    ),
    treeSha: required(
      environment,
      "REQUIRED_TEST_SOURCE_TREE_SHA",
      SOURCE_SHA
    ),
    stage: "browser-owners",
    stageAttempt: stageAttempt(environment, "REQUIRED_TEST_STAGE_ATTEMPT"),
    browserOwnerId: required(
      environment,
      "REQUIRED_TEST_BROWSER_OWNER_ID",
      BROWSER_OWNER
    ),
  };
}

export function certificationAppEventBinding(
  writerClassification: CertificationAppEventWriterClassification,
  environment: CertificationAppEventEnvironment = process.env
): CertificationAppEventBinding | null {
  const stage = environment.CERTIFICATION_ENVIRONMENT_STAGE?.trim();
  if (stage !== "runtime-smoke" && stage !== "browser-owners") return null;

  const base = {
    schema: BINDING_SCHEMA,
    certificationId: required(
      environment,
      "PRODUCTION_CERTIFICATION_ID",
      IDENTITY
    ),
    writerClassification,
  } as const;
  const stageBinding =
    stage === "runtime-smoke"
      ? runtimeStageBinding(environment)
      : browserStageBinding(environment);
  const binding = { ...base, ...stageBinding };
  return { ...binding, runIdentitySha256: runIdentitySha256(binding) };
}

export function bindCertificationAppEventMeta(
  meta: Record<string, unknown> | undefined,
  writerClassification: CertificationAppEventWriterClassification,
  environment: CertificationAppEventEnvironment = process.env
): Record<string, unknown> | undefined {
  const binding = certificationAppEventBinding(
    writerClassification,
    environment
  );
  if (!binding) return meta;
  return { ...(meta ?? {}), [CERTIFICATION_APP_EVENT_BINDING_KEY]: binding };
}
