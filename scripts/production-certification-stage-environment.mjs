import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

export const PRODUCTION_CERTIFICATION_STAGE_ENVIRONMENT_SCHEMA =
  "interior-ai.production-certification-stage-environment.v1";
export const PRODUCTION_CERTIFICATION_STAGE_ENVIRONMENT_PATH =
  "docs/qa/production-certification-stage-environment.v1.json";

function canonicalJsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sortedUniqueStrings(value, description) {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string" || !entry) ||
    new Set(value).size !== value.length
  ) {
    throw new Error(`${description} must be a unique string array`);
  }
  return [...value].sort();
}

function profileSemantic(id, profile, variables) {
  const referencedNames = [
    ...profile.parentOnlyVariables,
    ...profile.childVisibleVariables,
  ];
  return {
    id,
    profile,
    variables: Object.fromEntries(
      [...new Set(referencedNames)].sort().map((name) => [name, variables[name]]),
    ),
  };
}

export function stageEnvironmentContract(repositoryRoot = process.cwd()) {
  const contractPath = path.join(
    repositoryRoot,
    PRODUCTION_CERTIFICATION_STAGE_ENVIRONMENT_PATH,
  );
  const bytes = readFileSync(contractPath);
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("certification stage environment contract is invalid JSON");
  }
  if (
    value?.schema !== PRODUCTION_CERTIFICATION_STAGE_ENVIRONMENT_SCHEMA ||
    value?.version !== 1 ||
    value?.baseEnvironmentPolicy?.ordinaryVariables !== "preserve" ||
    value?.baseEnvironmentPolicy?.inventoriedVariablesDefaultVisibility !==
      "parent-only" ||
    value?.baseEnvironmentPolicy?.childVisibilityAndRequirement !==
      "derived-exclusively-from-profiles" ||
    value?.baseEnvironmentPolicy?.knownCertificationControlVariables !==
      "strip-unless-explicitly-child-visible" ||
    value?.baseEnvironmentPolicy?.unknownCertificationControlVariablesFromBase !==
      "strip-and-record" ||
    value?.baseEnvironmentPolicy?.unknownCertificationControlVariablesFromStageInputs !==
      "reject" ||
    value?.baseEnvironmentPolicy?.mutateProcessEnvironment !== false
  ) {
    throw new Error("certification stage environment base policy is unsupported");
  }
  const prefixes = sortedUniqueStrings(
    value.certificationControlPrefixes,
    "certification control prefixes",
  );
  const variables = value.variables;
  const profiles = value.profiles;
  if (!variables || typeof variables !== "object" || Array.isArray(variables)) {
    throw new Error("certification stage environment variable inventory is missing");
  }
  if (!profiles || typeof profiles !== "object" || Array.isArray(profiles)) {
    throw new Error("certification stage environment profiles are missing");
  }
  for (const [name, record] of Object.entries(variables)) {
    if (
      !/^[A-Z][A-Z0-9_]+$/.test(name) ||
      !record ||
      typeof record.owner !== "string" ||
      !record.owner ||
      typeof record.classification !== "string" ||
      !record.classification ||
      typeof record.portable !== "boolean" ||
      typeof record.secret !== "boolean" ||
      typeof record.presenceChangesBehavior !== "boolean"
    ) {
      throw new Error(`certification variable inventory is malformed: ${name}`);
    }
  }
  const normalizedProfiles = {};
  for (const [id, profile] of Object.entries(profiles)) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || !profile) {
      throw new Error(`certification environment profile ID is malformed: ${id}`);
    }
    const normalized = {
      ...profile,
      stages: sortedUniqueStrings(profile.stages, `${id} stages`),
      parentOnlyVariables: sortedUniqueStrings(
        profile.parentOnlyVariables,
        `${id} parent-only variables`,
      ),
      childVisibleVariables: sortedUniqueStrings(
        profile.childVisibleVariables,
        `${id} child-visible variables`,
      ),
      requiredVariables: sortedUniqueStrings(
        profile.requiredVariables,
        `${id} required variables`,
      ),
      optionalVariables: sortedUniqueStrings(
        profile.optionalVariables,
        `${id} optional variables`,
      ),
      activationVariables: sortedUniqueStrings(
        profile.activationVariables,
        `${id} activation variables`,
      ),
      allowedOutputEvidenceVariables: sortedUniqueStrings(
        profile.allowedOutputEvidenceVariables,
        `${id} output variables`,
      ),
      environmentIdentityHashInputs: sortedUniqueStrings(
        profile.environmentIdentityHashInputs,
        `${id} identity variables`,
      ),
      fixedValues: profile.fixedValues,
    };
    const referenced = new Set([
      ...normalized.parentOnlyVariables,
      ...normalized.childVisibleVariables,
    ]);
    if ([...referenced].some((name) => !variables[name])) {
      throw new Error(`certification environment profile references an unknown variable: ${id}`);
    }
    if (
      normalized.parentOnlyVariables.some((name) =>
        normalized.childVisibleVariables.includes(name),
      ) ||
      normalized.requiredVariables.some(
        (name) => !normalized.childVisibleVariables.includes(name),
      ) ||
      normalized.optionalVariables.some(
        (name) => !normalized.childVisibleVariables.includes(name),
      ) ||
      normalized.childVisibleVariables.some(
        (name) =>
          !normalized.requiredVariables.includes(name) &&
          !normalized.optionalVariables.includes(name),
      ) ||
      normalized.activationVariables.some(
        (name) => !normalized.childVisibleVariables.includes(name),
      ) ||
      normalized.allowedOutputEvidenceVariables.some(
        (name) => !normalized.childVisibleVariables.includes(name),
      ) ||
      normalized.environmentIdentityHashInputs.some(
        (name) => !normalized.childVisibleVariables.includes(name),
      ) ||
      normalized.prohibitedCertificationControlVariables !==
        "all-except-child-visible" ||
      !normalized.fixedValues ||
      typeof normalized.fixedValues !== "object" ||
      Array.isArray(normalized.fixedValues) ||
      Object.keys(normalized.fixedValues).some(
        (name) =>
          !normalized.childVisibleVariables.includes(name) ||
          typeof normalized.fixedValues[name] !== "string" ||
          !normalized.fixedValues[name],
      )
    ) {
      throw new Error(`certification environment profile is contradictory: ${id}`);
    }
    const semantic = profileSemantic(id, normalized, variables);
    normalizedProfiles[id] = Object.freeze({
      ...normalized,
      sha256: sha256(canonicalJsonBytes(semantic)),
      allowedVariableNamesSha256: sha256(
        canonicalJsonBytes(normalized.childVisibleVariables),
      ),
      requiredVariableNamesSha256: sha256(
        canonicalJsonBytes(normalized.requiredVariables),
      ),
    });
  }
  return Object.freeze({
    value: Object.freeze({ ...value, profiles: Object.freeze(normalizedProfiles) }),
    sha256: sha256(bytes),
    path: PRODUCTION_CERTIFICATION_STAGE_ENVIRONMENT_PATH,
    prefixes: Object.freeze(prefixes),
    variables: Object.freeze(variables),
    profiles: Object.freeze(normalizedProfiles),
  });
}

export function isCertificationControlVariableName(
  name,
  contract = stageEnvironmentContract(),
) {
  return (
    Object.hasOwn(contract.variables, name) ||
    contract.prefixes.some((prefix) => name.startsWith(prefix))
  );
}

export function certificationEnvironmentProfile(
  repositoryRoot,
  profileId,
) {
  const contract = stageEnvironmentContract(repositoryRoot);
  const profile = contract.profiles[profileId];
  if (!profile) {
    throw new Error(`unknown certification environment profile: ${String(profileId)}`);
  }
  return Object.freeze({ contract, id: profileId, ...profile });
}

export function projectCertificationChildEnvironment({
  repositoryRoot = process.cwd(),
  baseEnvironment = process.env,
  stage,
  checkId = null,
  profileId,
  requiredEnvironmentNames = [],
  stageInputs = {},
}) {
  const profile = certificationEnvironmentProfile(repositoryRoot, profileId);
  if (!profile.stages.includes(stage)) {
    throw new Error(
      `certification environment profile ${profileId} cannot execute stage ${String(stage)}`,
    );
  }
  if (
    !stageInputs ||
    typeof stageInputs !== "object" ||
    Array.isArray(stageInputs)
  ) {
    throw new Error("certification stage inputs must be a named object");
  }
  const staticRequiredNames = sortedUniqueStrings(
    requiredEnvironmentNames,
    `${profileId} check-required environment names`,
  );
  if (
    staticRequiredNames.some((name) => !/^[A-Z][A-Z0-9_]+$/.test(name)) ||
    staticRequiredNames.some(
      (name) =>
        isCertificationControlVariableName(name, profile.contract) &&
        !profile.childVisibleVariables.includes(name),
    )
  ) {
    throw new Error(
      `certification environment profile ${profileId} has a prohibited check-required name`,
    );
  }
  const allowedVariableNames = [
    ...new Set([...profile.childVisibleVariables, ...staticRequiredNames]),
  ].sort();
  const requiredVariableNames = [
    ...new Set([...profile.requiredVariables, ...staticRequiredNames]),
  ].sort();
  const environment = {};
  const strippedKnown = [];
  const strippedUnknown = [];
  for (const name of Object.keys(baseEnvironment).sort()) {
    const value = baseEnvironment[name];
    if (value === undefined) continue;
    if (Object.hasOwn(profile.contract.variables, name)) {
      strippedKnown.push(name);
      continue;
    }
    if (profile.contract.prefixes.some((prefix) => name.startsWith(prefix))) {
      strippedUnknown.push(name);
      continue;
    }
    environment[name] = value;
  }
  for (const name of Object.keys(stageInputs).sort()) {
    if (!Object.hasOwn(profile.contract.variables, name)) {
      if (isCertificationControlVariableName(name, profile.contract)) {
        throw new Error(`unknown certification-control stage input: ${name}`);
      }
      throw new Error(`undeclared stage input: ${name}`);
    }
    if (!profile.childVisibleVariables.includes(name)) {
      throw new Error(
        `certification environment profile ${profileId} prohibits stage input ${name}`,
      );
    }
    const value = stageInputs[name];
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`certification stage input is missing: ${name}`);
    }
    environment[name] = value;
  }
  for (const [name, expected] of Object.entries(profile.fixedValues)) {
    if (environment[name] !== expected) {
      throw new Error(
        `certification environment profile ${profileId} requires fixed input ${name}`,
      );
    }
  }
  const missing = requiredVariableNames.filter(
    (name) => !environment[name]?.trim(),
  );
  if (missing.length > 0) {
    throw new Error(
      `certification environment profile ${profileId} is missing required names: ${missing.join(", ")}`,
    );
  }
  const leakedControlVariables = Object.keys(environment)
    .filter(
      (name) =>
        isCertificationControlVariableName(name, profile.contract) &&
        !profile.childVisibleVariables.includes(name),
    )
    .sort();
  if (leakedControlVariables.length > 0) {
    throw new Error(
      `certification environment profile ${profileId} leaked prohibited names: ${leakedControlVariables.join(", ")}`,
    );
  }
  const environmentNames = Object.keys(environment).sort();
  const visibleCertificationVariables = profile.childVisibleVariables
    .filter((name) => Object.hasOwn(environment, name))
    .map((name) => ({
      name,
      classification: profile.contract.variables[name].classification,
      secret: profile.contract.variables[name].secret,
    }));
  const metadata = Object.freeze({
    profileId,
    stage,
    checkId,
    contractSchema: PRODUCTION_CERTIFICATION_STAGE_ENVIRONMENT_SCHEMA,
    contractSha256: profile.contract.sha256,
    profileSha256: profile.sha256,
    allowedVariableNamesSha256: sha256(canonicalJsonBytes(allowedVariableNames)),
    requiredVariableNamesSha256: sha256(canonicalJsonBytes(requiredVariableNames)),
    environmentNames,
    environmentNamesSha256: sha256(canonicalJsonBytes(environmentNames)),
    visibleCertificationVariables,
    strippedKnownCertificationControlVariables: strippedKnown.sort(),
    strippedUnknownCertificationControlVariables: strippedUnknown.sort(),
    prohibitedCertificationVariableAbsence: Object.freeze({
      passed: true,
      checkedNameCount: environmentNames.length,
    }),
  });
  return Object.freeze({ environment: Object.freeze(environment), metadata });
}

export function validateProjectedEnvironmentMetadata({
  repositoryRoot = process.cwd(),
  stage,
  checkId = null,
  profileId,
  requiredEnvironmentNames = [],
  metadata,
}) {
  const issues = [];
  let profile;
  try {
    profile = certificationEnvironmentProfile(repositoryRoot, profileId);
  } catch (error) {
    return { valid: false, issues: [error instanceof Error ? error.message : String(error)] };
  }
  let staticRequiredNames;
  try {
    staticRequiredNames = sortedUniqueStrings(
      requiredEnvironmentNames,
      `${profileId} check-required environment names`,
    );
  } catch (error) {
    return { valid: false, issues: [error instanceof Error ? error.message : String(error)] };
  }
  const allowedVariableNames = [
    ...new Set([...profile.childVisibleVariables, ...staticRequiredNames]),
  ].sort();
  const requiredVariableNames = [
    ...new Set([...profile.requiredVariables, ...staticRequiredNames]),
  ].sort();
  if (
    metadata?.profileId !== profileId ||
    metadata?.stage !== stage ||
    metadata?.checkId !== checkId ||
    metadata?.contractSchema !== PRODUCTION_CERTIFICATION_STAGE_ENVIRONMENT_SCHEMA ||
    metadata?.contractSha256 !== profile.contract.sha256 ||
    metadata?.profileSha256 !== profile.sha256 ||
    metadata?.allowedVariableNamesSha256 !==
      sha256(canonicalJsonBytes(allowedVariableNames)) ||
    metadata?.requiredVariableNamesSha256 !==
      sha256(canonicalJsonBytes(requiredVariableNames))
  ) {
    issues.push("certification environment profile identity or hash mismatch");
  }
  if (
    !Array.isArray(metadata?.environmentNames) ||
    JSON.stringify(metadata.environmentNames) !==
      JSON.stringify([...new Set(metadata?.environmentNames ?? [])].sort()) ||
    metadata?.environmentNamesSha256 !==
      sha256(canonicalJsonBytes(metadata?.environmentNames ?? []))
  ) {
    issues.push("certification environment name inventory changed after execution");
  }
  if (
    requiredVariableNames.some(
      (name) => !metadata?.environmentNames?.includes(name),
    )
  ) {
    issues.push("certification environment required name is absent");
  }
  const expectedVisibleVariables = profile.childVisibleVariables
    .filter((name) => metadata?.environmentNames?.includes(name))
    .map((name) => ({
      name,
      classification: profile.contract.variables[name].classification,
      secret: profile.contract.variables[name].secret,
    }));
  if (
    JSON.stringify(metadata?.visibleCertificationVariables) !==
    JSON.stringify(expectedVisibleVariables)
  ) {
    issues.push("certification environment variable classifications are stale");
  }
  if (
    metadata?.prohibitedCertificationVariableAbsence?.passed !== true ||
    metadata?.prohibitedCertificationVariableAbsence?.checkedNameCount !==
      metadata?.environmentNames?.length
  ) {
    issues.push("prohibited certification variable absence is not proven");
  }
  const leaked = (metadata?.environmentNames ?? []).filter(
    (name) =>
      isCertificationControlVariableName(name, profile.contract) &&
      !profile.childVisibleVariables.includes(name),
  );
  if (leaked.length > 0) {
    issues.push(`projected environment contains prohibited names: ${leaked.join(", ")}`);
  }
  return { valid: issues.length === 0, issues };
}
