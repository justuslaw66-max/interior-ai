import { stageEnvironmentContract } from "./production-certification-stage-environment.mjs";
import resultContract from "./ci-auth-fixture-result-contract.cjs";
import sessionContract from "./ci-auth-fixture-session.cjs";

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
