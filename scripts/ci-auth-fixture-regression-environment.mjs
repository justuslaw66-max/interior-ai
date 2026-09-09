import path from "node:path";

import { stageEnvironmentContract } from "./production-certification-stage-environment.mjs";
import resultContract from "./ci-auth-fixture-result-contract.cjs";
import sessionContract from "./ci-auth-fixture-session.cjs";

const SIMULATION_RUNTIME_VARIABLE_NAMES = Object.freeze([
  "COMSPEC",
  "ComSpec",
  "HOME",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "PATH",
  "PATHEXT",
  "SYSTEMROOT",
  "SystemRoot",
  "TEMP",
  "TMP",
  "TMPDIR",
  "TZ",
  "USERPROFILE",
]);
const SOURCE_SHA_PATTERN = /^[a-f0-9]{40}$/;

function assertExternalSimulationRoot(repositoryRoot, value, description) {
  if (typeof value !== "string" || !path.isAbsolute(value)) {
    throw new Error(`${description} must be an absolute path`);
  }
  const relative = path.relative(repositoryRoot, value);
  if (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  ) {
    throw new Error(`${description} must remain outside the repository`);
  }
}

export function projectProductionCertificationSimulationRuntimeEnvironment({
  repositoryRoot = process.cwd(),
  baseEnvironment,
}) {
  const isolated = isolatedAuthFixtureRegressionEnvironment({
    repositoryRoot,
    parentEnvironment: baseEnvironment,
  });
  const environment = Object.fromEntries(
    SIMULATION_RUNTIME_VARIABLE_NAMES.filter((name) =>
      Object.hasOwn(isolated, name),
    ).map((name) => [name, isolated[name]]),
  );
  return Object.freeze({
    environment: Object.freeze(environment),
    metadata: Object.freeze({
      preservedRuntimeNames: Object.freeze(Object.keys(environment).sort()),
      removedAuthCapabilityNames: Object.freeze(
        authFixtureRegressionCapabilityNames(repositoryRoot).filter((name) =>
          Object.hasOwn(baseEnvironment, name),
        ),
      ),
    }),
  });
}

export function projectProductionCertificationSimulationEnvironment({
  repositoryRoot = process.cwd(),
  baseEnvironment,
  simulationCandidate,
  simulationFixtureRoot,
  simulationResultRoot,
}) {
  if (
    !SOURCE_SHA_PATTERN.test(simulationCandidate?.commitSha || "") ||
    !SOURCE_SHA_PATTERN.test(simulationCandidate?.treeSha || "")
  ) {
    throw new Error("production certification simulation candidate is invalid");
  }
  assertExternalSimulationRoot(
    repositoryRoot,
    simulationFixtureRoot,
    "production certification simulation fixture root",
  );
  assertExternalSimulationRoot(
    repositoryRoot,
    simulationResultRoot,
    "production certification simulation result root",
  );
  const runtime = projectProductionCertificationSimulationRuntimeEnvironment({
    repositoryRoot,
    baseEnvironment,
  });
  return Object.freeze({
    environment: Object.freeze({
      ...runtime.environment,
      CI_AUTH_FIXTURE_MODE: "1",
      CI_AUTH_FIXTURE_LOCAL_TEST: "1",
      CI_AUTH_FIXTURE_CANDIDATE_COMMIT_SHA: simulationCandidate.commitSha,
      CI_AUTH_FIXTURE_CANDIDATE_TREE_SHA: simulationCandidate.treeSha,
      CI_AUTH_FIXTURE_RESULT_ROOT: simulationResultRoot,
      CI_AUTH_FIXTURE_SESSION_ROOT: simulationFixtureRoot,
      CI_AUTH_FIXTURE_SESSION_ID:
        `simulation-auth-${simulationCandidate.commitSha.slice(0, 16)}`,
      CI_AUTH_FIXTURE_SESSION_NONCE:
        `simulation-auth-${simulationCandidate.treeSha.slice(0, 16)}`,
      CI_AUTH_FIXTURE_SESSION_CLASSIFICATION:
        sessionContract.FIXTURE_SESSION_CLASSIFICATION,
    }),
    metadata: runtime.metadata,
  });
}

export function authFixtureRegressionCapabilityNames(
  repositoryRoot = process.cwd(),
) {
  const contractNames = Object.keys(
    stageEnvironmentContract(repositoryRoot).variables,
  ).filter((name) => name.startsWith("CI_AUTH_"));
  const resultNames = Object.entries(resultContract)
    .filter(
      ([key, value]) =>
        key.endsWith("_ENV") &&
        typeof value === "string" &&
        value.startsWith("CI_AUTH_"),
    )
    .map(([, value]) => value);
  const privateAuthNames = resultContract.AUTH_PRIVATE_VALUE_NAMES.filter(
    (name) => name !== "DATABASE_URL",
  );
  return Object.freeze(
    [
      ...new Set([
        ...sessionContract.EXPORTED_VARIABLE_NAMES,
        ...contractNames,
        ...resultNames,
        ...privateAuthNames,
      ]),
    ].sort(),
  );
}

export function isolatedAuthFixtureRegressionEnvironment({
  repositoryRoot = process.cwd(),
  parentEnvironment,
}) {
  if (
    !parentEnvironment ||
    typeof parentEnvironment !== "object" ||
    Array.isArray(parentEnvironment)
  ) {
    throw new Error("auth fixture regression parent environment is invalid");
  }
  const environment = { ...parentEnvironment };
  for (const name of authFixtureRegressionCapabilityNames(repositoryRoot)) {
    delete environment[name];
  }
  return environment;
}
