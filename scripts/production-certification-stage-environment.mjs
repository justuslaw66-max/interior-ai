import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

export const PRODUCTION_CERTIFICATION_STAGE_ENVIRONMENT_SCHEMA =
  "interior-ai.production-certification-stage-environment.v2";
export const PRODUCTION_CERTIFICATION_STAGE_ENVIRONMENT_PATH =
  "docs/qa/production-certification-stage-environment.v2.json";

const VALUE_POLICY_KINDS = Object.freeze([
  "must-be-absent",
  "exact-non-secret-boolean",
  "exact-non-secret-enum",
  "required-present-secret-value-not-recorded",
  "optional-secret-value-not-recorded",
  "check-owned-fixture-value",
  "optional-non-secret-enum",
  "optional-non-secret-value",
]);

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

function exactKeys(value, expected) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) ===
      JSON.stringify([...expected].sort())
  );
}

function isEnvironmentVariableName(name) {
  return typeof name === "string" && /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

function normalizeValuePolicies(value, applicationFeatureVariables, profileId) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${profileId} value policies must be a named object`);
  }
  const normalized = {};
  for (const [name, record] of Object.entries(value).sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const variable = applicationFeatureVariables[name];
    if (!variable || !record || !VALUE_POLICY_KINDS.includes(record.policy)) {
      throw new Error(`${profileId} value policy is unknown: ${name}`);
    }
    if (record.policy === "must-be-absent") {
      if (!exactKeys(record, ["policy"])) {
        throw new Error(`${profileId} absent value policy is malformed: ${name}`);
      }
    } else if (record.policy === "check-owned-fixture-value") {
      if (
        variable.secret ||
        !exactKeys(record, ["policy", "valueType", "value", "ownerCheckIds"]) ||
        !["boolean", "enum"].includes(record.valueType) ||
        typeof record.value !== "string" ||
        !record.value ||
        (record.valueType === "boolean" && !["0", "1"].includes(record.value)) ||
        sortedUniqueStrings(
          record.ownerCheckIds,
          `${profileId} ${name} fixture owner check IDs`,
        ).some((id) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))
      ) {
        throw new Error(`${profileId} check-owned value policy is malformed: ${name}`);
      }
    } else if (record.policy === "exact-non-secret-boolean") {
      if (
        variable.secret ||
        !exactKeys(record, ["policy", "value"]) ||
        !["0", "1"].includes(record.value)
      ) {
        throw new Error(`${profileId} exact boolean policy is malformed: ${name}`);
      }
    } else if (record.policy === "exact-non-secret-enum") {
      if (
        variable.secret ||
        !exactKeys(record, ["policy", "value", "allowedValues"]) ||
        typeof record.value !== "string" ||
        !record.value ||
        !sortedUniqueStrings(
          record.allowedValues,
          `${profileId} ${name} exact enum values`,
        ).includes(record.value)
      ) {
        throw new Error(`${profileId} exact enum policy is malformed: ${name}`);
      }
    } else if (record.policy === "optional-non-secret-enum") {
      if (
        variable.secret ||
        !exactKeys(record, ["policy", "allowedValues"]) ||
        sortedUniqueStrings(
          record.allowedValues,
          `${profileId} ${name} optional enum values`,
        ).length === 0
      ) {
        throw new Error(`${profileId} optional enum policy is malformed: ${name}`);
      }
    } else if (record.policy === "optional-non-secret-value") {
      if (variable.secret || !exactKeys(record, ["policy"])) {
        throw new Error(`${profileId} optional value policy is malformed: ${name}`);
      }
    } else {
      const requiredSecret =
        record.policy === "required-present-secret-value-not-recorded";
      if (!variable.secret || !exactKeys(record, ["policy"]) || (!requiredSecret && record.policy !== "optional-secret-value-not-recorded")) {
        throw new Error(`${profileId} secret value policy is malformed: ${name}`);
      }
    }
    normalized[name] = Object.freeze({
      ...record,
      ...(record.ownerCheckIds
        ? {
            ownerCheckIds: Object.freeze(
              sortedUniqueStrings(
                record.ownerCheckIds,
                `${profileId} ${name} fixture owner check IDs`,
              ),
            ),
          }
        : {}),
      ...(record.allowedValues
        ? {
            allowedValues: Object.freeze(
              sortedUniqueStrings(
                record.allowedValues,
                `${profileId} ${name} allowed values`,
              ),
            ),
          }
        : {}),
    });
  }
  return Object.freeze(normalized);
}

function profileSemantic(id, profile, variables, applicationFeatureVariables) {
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
    applicationFeatureVariables: Object.fromEntries(
      Object.keys(profile.valuePolicies)
        .sort()
        .map((name) => [name, applicationFeatureVariables[name]]),
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
    value?.version !== 2 ||
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
    value?.baseEnvironmentPolicy?.mutateProcessEnvironment !== false ||
    value?.baseEnvironmentPolicy?.applicationFeatureVariablesDefaultVisibility !==
      "preserve-unless-profile-policy" ||
    value?.baseEnvironmentPolicy?.profileValuePolicies !==
      "strip-ambient-before-applying-declared-policy"
  ) {
    throw new Error("certification stage environment base policy is unsupported");
  }
  const prefixes = sortedUniqueStrings(
    value.certificationControlPrefixes,
    "certification control prefixes",
  );
  const applicationFeaturePrefixes = sortedUniqueStrings(
    value.applicationFeaturePrefixes,
    "application-feature prefixes",
  );
  const variables = value.variables;
  const applicationFeatureVariables = value.applicationFeatureVariables;
  const profiles = value.profiles;
  if (!variables || typeof variables !== "object" || Array.isArray(variables)) {
    throw new Error("certification stage environment variable inventory is missing");
  }
  if (!profiles || typeof profiles !== "object" || Array.isArray(profiles)) {
    throw new Error("certification stage environment profiles are missing");
  }
  if (
    !applicationFeatureVariables ||
    typeof applicationFeatureVariables !== "object" ||
    Array.isArray(applicationFeatureVariables)
  ) {
    throw new Error("certification application-feature inventory is missing");
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
  for (const [name, record] of Object.entries(applicationFeatureVariables)) {
    if (
      !/^[A-Z][A-Z0-9_]+$/.test(name) ||
      Object.hasOwn(variables, name) ||
      !record ||
      typeof record.owner !== "string" ||
      !record.owner ||
      typeof record.classification !== "string" ||
      !record.classification ||
      typeof record.secret !== "boolean" ||
      !Array.isArray(record.acceptedValues) ||
      record.acceptedValues.some((entry) => typeof entry !== "string" || !entry) ||
      typeof record.defaultWhenAbsent !== "string" ||
      !record.defaultWhenAbsent ||
      typeof record.presenceAloneChangesBehavior !== "boolean" ||
      typeof record.readTiming !== "string" ||
      !record.readTiming
    ) {
      throw new Error(`certification application-feature inventory is malformed: ${name}`);
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
      valuePolicies: normalizeValuePolicies(
        profile.valuePolicies ?? {},
        applicationFeatureVariables,
        id,
      ),
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
    const semantic = profileSemantic(
      id,
      normalized,
      variables,
      applicationFeatureVariables,
    );
    normalizedProfiles[id] = Object.freeze({
      ...normalized,
      sha256: sha256(canonicalJsonBytes(semantic)),
      valuePolicySha256: sha256(canonicalJsonBytes(normalized.valuePolicies)),
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
    applicationFeaturePrefixes: Object.freeze(applicationFeaturePrefixes),
    variables: Object.freeze(variables),
    applicationFeatureVariables: Object.freeze(applicationFeatureVariables),
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

function policyOwnsValueForCheck(policy, checkId) {
  return (
    policy.policy !== "check-owned-fixture-value" ||
    policy.ownerCheckIds.includes(checkId)
  );
}

function policyRequiresValueForCheck(policy, checkId) {
  return (
    [
      "exact-non-secret-boolean",
      "exact-non-secret-enum",
      "required-present-secret-value-not-recorded",
    ].includes(policy.policy) ||
    (policy.policy === "check-owned-fixture-value" &&
      policy.ownerCheckIds.includes(checkId))
  );
}

function policyOverridesAmbientValue(policy) {
  return [
    "must-be-absent",
    "exact-non-secret-boolean",
    "exact-non-secret-enum",
    "check-owned-fixture-value",
  ].includes(policy.policy);
}

function nonSecretValueClassification(value, valueType = "value") {
  if (valueType === "boolean") return value === "1" ? "boolean:true" : "boolean:false";
  if (valueType === "enum") return `enum:${value}`;
  return "present-non-secret";
}

function applyValuePolicies({ profile, baseEnvironment, environment, checkId }) {
  const appliedValuePolicies = [];
  const ambientApplicationVariableNamesStripped = [];
  for (const [name, policy] of Object.entries(profile.valuePolicies)) {
    const variable = profile.contract.applicationFeatureVariables[name];
    const ambient = baseEnvironment[name];
    const ambientDefined = ambient !== undefined;
    const ambientPresent = typeof ambient === "string" && ambient.length > 0;
    delete environment[name];
    if (ambientDefined) ambientApplicationVariableNamesStripped.push(name);
    let source = ambientDefined ? "ambient-stripped" : "ambient-absent";
    let effectiveValueClassification = "absent";
    if (policy.policy === "must-be-absent") {
      // The profile owns absence; ambient input is deliberately not retained.
    } else if (policy.policy === "check-owned-fixture-value") {
      if (policyOwnsValueForCheck(policy, checkId)) {
        environment[name] = policy.value;
        source = "check-owned-fixture";
        effectiveValueClassification = nonSecretValueClassification(
          policy.value,
          policy.valueType,
        );
      }
    } else if (
      policy.policy === "exact-non-secret-boolean" ||
      policy.policy === "exact-non-secret-enum"
    ) {
      environment[name] = policy.value;
      source = "profile-exact-value";
      effectiveValueClassification = nonSecretValueClassification(
        policy.value,
        policy.policy.endsWith("boolean") ? "boolean" : "enum",
      );
    } else if (
      policy.policy === "required-present-secret-value-not-recorded" ||
      policy.policy === "optional-secret-value-not-recorded"
    ) {
      if (
        policy.policy === "required-present-secret-value-not-recorded" &&
        !ambientPresent
      ) {
        throw new Error(
          `certification environment profile ${profile.id} is missing required secret name: ${name}`,
        );
      }
      if (ambientPresent) {
        environment[name] = ambient;
        source = "ambient-secret-retained-without-value-evidence";
        effectiveValueClassification = "secret:present";
      } else {
        effectiveValueClassification = "secret:absent";
      }
    } else if (policy.policy === "optional-non-secret-enum") {
      if (ambientPresent) {
        if (!policy.allowedValues.includes(ambient)) {
          throw new Error(
            `certification environment profile ${profile.id} received an invalid enum for ${name}`,
          );
        }
        environment[name] = ambient;
        source = "ambient-non-secret-retained";
        effectiveValueClassification = nonSecretValueClassification(
          ambient,
          "enum",
        );
      }
    } else if (policy.policy === "optional-non-secret-value" && ambientPresent) {
      environment[name] = ambient;
      source = "ambient-non-secret-retained";
      effectiveValueClassification = "present-non-secret";
    }
    appliedValuePolicies.push(
      Object.freeze({
        name,
        policy: policy.policy,
        secret: variable.secret,
        ambientValueClassification: ambientDefined
          ? ambientPresent
            ? "present-non-empty"
            : "present-empty"
          : "absent",
        source,
        effectiveValueClassification,
      }),
    );
  }
  const prohibitedAmbientNames = Object.entries(profile.valuePolicies)
    .filter(([, policy]) => policyOverridesAmbientValue(policy))
    .map(([name]) => name)
    .sort();
  return Object.freeze({
    appliedValuePolicies: Object.freeze(appliedValuePolicies),
    ambientApplicationVariableNamesStripped: Object.freeze(
      ambientApplicationVariableNamesStripped.sort(),
    ),
    prohibitedAmbientValueAbsence: Object.freeze({
      passed: true,
      checkedNames: Object.freeze(prohibitedAmbientNames),
      checkedNameCount: prohibitedAmbientNames.length,
      ambientValuesRetained: false,
    }),
  });
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
    ...new Set([
      ...profile.childVisibleVariables,
      ...staticRequiredNames,
      ...Object.keys(profile.valuePolicies),
    ]),
  ].sort();
  const requiredVariableNames = [
    ...new Set([
      ...profile.requiredVariables,
      ...staticRequiredNames,
      ...Object.entries(profile.valuePolicies)
        .filter(([, policy]) => policyRequiresValueForCheck(policy, checkId))
        .map(([name]) => name),
    ]),
  ].sort();
  const environment = {};
  const strippedKnown = [];
  const strippedUnknown = [];
  const strippedUnknownApplicationFeatures = [];
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
    if (Object.hasOwn(profile.valuePolicies, name)) continue;
    if (
      !Object.hasOwn(profile.contract.applicationFeatureVariables, name) &&
      profile.contract.applicationFeaturePrefixes.some((prefix) =>
        name.startsWith(prefix),
      )
    ) {
      strippedUnknownApplicationFeatures.push(name);
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
  const valuePolicyEvidence = applyValuePolicies({
    profile,
    baseEnvironment,
    environment,
    checkId,
  });
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
    valuePolicySha256: profile.valuePolicySha256,
    appliedValuePolicies: valuePolicyEvidence.appliedValuePolicies,
    valuePolicyValidation: Object.freeze({
      passed: true,
      checkedPolicyCount: Object.keys(profile.valuePolicies).length,
    }),
    ambientApplicationVariableNamesStripped:
      valuePolicyEvidence.ambientApplicationVariableNamesStripped,
    prohibitedAmbientValueAbsence:
      valuePolicyEvidence.prohibitedAmbientValueAbsence,
    environmentNames,
    environmentNamesSha256: sha256(canonicalJsonBytes(environmentNames)),
    visibleCertificationVariables,
    strippedKnownCertificationControlVariables: strippedKnown.sort(),
    strippedUnknownCertificationControlVariables: strippedUnknown.sort(),
    strippedUnknownApplicationFeatureVariables:
      strippedUnknownApplicationFeatures.sort(),
    prohibitedCertificationVariableAbsence: Object.freeze({
      passed: true,
      checkedNameCount: environmentNames.length,
    }),
  });
  return Object.freeze({ environment: Object.freeze(environment), metadata });
}

function valuePolicyMetadataIssues(profile, checkId, metadata) {
  const issues = [];
  const policyNames = Object.keys(profile.valuePolicies).sort();
  const records = metadata?.appliedValuePolicies;
  if (
    metadata?.valuePolicySha256 !== profile.valuePolicySha256 ||
    !Array.isArray(records) ||
    JSON.stringify(records.map((record) => record?.name)) !==
      JSON.stringify(policyNames) ||
    !exactKeys(metadata?.valuePolicyValidation, ["passed", "checkedPolicyCount"]) ||
    metadata?.valuePolicyValidation?.passed !== true ||
    metadata?.valuePolicyValidation?.checkedPolicyCount !== policyNames.length
  ) {
    issues.push("certification environment value-policy identity or result mismatch");
    return issues;
  }
  const environmentNames = metadata?.environmentNames ?? [];
  for (const record of records) {
    const policy = profile.valuePolicies[record.name];
    const variable = profile.contract.applicationFeatureVariables[record.name];
    if (
      !exactKeys(record, [
        "name",
        "policy",
        "secret",
        "ambientValueClassification",
        "source",
        "effectiveValueClassification",
      ]) ||
      record.policy !== policy.policy ||
      record.secret !== variable.secret ||
      !["absent", "present-empty", "present-non-empty"].includes(
        record.ambientValueClassification,
      )
    ) {
      issues.push(`certification environment value-policy record is malformed: ${record.name}`);
      continue;
    }
    const present = environmentNames.includes(record.name);
    const ambientSource =
      record.ambientValueClassification === "absent"
        ? "ambient-absent"
        : "ambient-stripped";
    if (policy.policy === "must-be-absent") {
      if (
        present ||
        record.effectiveValueClassification !== "absent" ||
        record.source !== ambientSource
      ) {
        issues.push(`certification environment required absence changed: ${record.name}`);
      }
    } else if (policy.policy === "check-owned-fixture-value") {
      const owned = policy.ownerCheckIds.includes(checkId);
      const expectedClassification = owned
        ? nonSecretValueClassification(policy.value, policy.valueType)
        : "absent";
      if (
        present !== owned ||
        record.effectiveValueClassification !== expectedClassification ||
        (owned && record.source !== "check-owned-fixture") ||
        (!owned && record.source !== ambientSource)
      ) {
        issues.push(`certification check-owned fixture value changed: ${record.name}`);
      }
    } else if (
      policy.policy === "exact-non-secret-boolean" ||
      policy.policy === "exact-non-secret-enum"
    ) {
      const expectedClassification = nonSecretValueClassification(
        policy.value,
        policy.policy.endsWith("boolean") ? "boolean" : "enum",
      );
      if (
        !present ||
        record.source !== "profile-exact-value" ||
        record.effectiveValueClassification !== expectedClassification
      ) {
        issues.push(`certification exact value changed: ${record.name}`);
      }
    } else if (
      policy.policy === "required-present-secret-value-not-recorded" ||
      policy.policy === "optional-secret-value-not-recorded"
    ) {
      if (
        (policy.policy === "required-present-secret-value-not-recorded" && !present) ||
        present !==
          (record.ambientValueClassification === "present-non-empty") ||
        record.effectiveValueClassification !==
          (present ? "secret:present" : "secret:absent") ||
        (present &&
          record.source !== "ambient-secret-retained-without-value-evidence") ||
        (!present && record.source !== ambientSource)
      ) {
        issues.push(`certification secret presence classification changed: ${record.name}`);
      }
    } else if (policy.policy === "optional-non-secret-enum") {
      const classification = record.effectiveValueClassification;
      if (
        (present &&
          (record.ambientValueClassification !== "present-non-empty" ||
            !classification.startsWith("enum:") ||
            !policy.allowedValues.includes(classification.slice("enum:".length)) ||
            record.source !== "ambient-non-secret-retained")) ||
        (!present &&
          (record.ambientValueClassification === "present-non-empty" ||
            classification !== "absent" ||
            record.source !== ambientSource))
      ) {
        issues.push(`certification optional enum classification changed: ${record.name}`);
      }
    } else if (
      policy.policy === "optional-non-secret-value" &&
      (record.effectiveValueClassification !==
        (present ? "present-non-secret" : "absent") ||
        (present &&
          (record.ambientValueClassification !== "present-non-empty" ||
            record.source !== "ambient-non-secret-retained")) ||
        (!present &&
          (record.ambientValueClassification === "present-non-empty" ||
            record.source !== ambientSource)))
    ) {
      issues.push(`certification optional value classification changed: ${record.name}`);
    }
  }
  const strippedNames = metadata?.ambientApplicationVariableNamesStripped;
  if (
    !Array.isArray(strippedNames) ||
    JSON.stringify(strippedNames) !==
      JSON.stringify([...new Set(strippedNames ?? [])].sort()) ||
    strippedNames.some((name) => !policyNames.includes(name))
  ) {
    issues.push("ambient application-value stripping inventory is malformed");
  } else if (
    records.some(
      (record) =>
        strippedNames.includes(record.name) !==
        (record.ambientValueClassification !== "absent"),
    )
  ) {
    issues.push("ambient application-value provenance does not match stripping inventory");
  }
  const prohibitedNames = Object.entries(profile.valuePolicies)
    .filter(([, policy]) => policyOverridesAmbientValue(policy))
    .map(([name]) => name)
    .sort();
  if (
    !exactKeys(metadata?.prohibitedAmbientValueAbsence, [
      "passed",
      "checkedNames",
      "checkedNameCount",
      "ambientValuesRetained",
    ]) ||
    metadata?.prohibitedAmbientValueAbsence?.passed !== true ||
    metadata?.prohibitedAmbientValueAbsence?.ambientValuesRetained !== false ||
    metadata?.prohibitedAmbientValueAbsence?.checkedNameCount !==
      prohibitedNames.length ||
    JSON.stringify(metadata?.prohibitedAmbientValueAbsence?.checkedNames) !==
      JSON.stringify(prohibitedNames)
  ) {
    issues.push("prohibited ambient application values are not proven absent");
  }
  return issues;
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
  if (
    !exactKeys(metadata, [
      "profileId",
      "stage",
      "checkId",
      "contractSchema",
      "contractSha256",
      "profileSha256",
      "allowedVariableNamesSha256",
      "requiredVariableNamesSha256",
      "valuePolicySha256",
      "appliedValuePolicies",
      "valuePolicyValidation",
      "ambientApplicationVariableNamesStripped",
      "prohibitedAmbientValueAbsence",
      "environmentNames",
      "environmentNamesSha256",
      "visibleCertificationVariables",
      "strippedKnownCertificationControlVariables",
      "strippedUnknownCertificationControlVariables",
      "strippedUnknownApplicationFeatureVariables",
      "prohibitedCertificationVariableAbsence",
    ])
  ) {
    issues.push("certification environment metadata envelope is malformed");
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
    ...new Set([
      ...profile.childVisibleVariables,
      ...staticRequiredNames,
      ...Object.keys(profile.valuePolicies),
    ]),
  ].sort();
  const requiredVariableNames = [
    ...new Set([
      ...profile.requiredVariables,
      ...staticRequiredNames,
      ...Object.entries(profile.valuePolicies)
        .filter(([, policy]) => policyRequiresValueForCheck(policy, checkId))
        .map(([name]) => name),
    ]),
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
    metadata.environmentNames.some((name) => !isEnvironmentVariableName(name)) ||
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
  issues.push(...valuePolicyMetadataIssues(profile, checkId, metadata));
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
    !exactKeys(metadata?.prohibitedCertificationVariableAbsence, [
      "passed",
      "checkedNameCount",
    ]) ||
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
  const strippedKnownCertificationControls =
    metadata?.strippedKnownCertificationControlVariables;
  if (
    !Array.isArray(strippedKnownCertificationControls) ||
    JSON.stringify(strippedKnownCertificationControls) !==
      JSON.stringify(
        [...new Set(strippedKnownCertificationControls ?? [])].sort(),
      ) ||
    strippedKnownCertificationControls.some(
      (name) =>
        !Object.hasOwn(profile.contract.variables, name) ||
        ((metadata?.environmentNames ?? []).includes(name) &&
          !profile.childVisibleVariables.includes(name)),
    )
  ) {
    issues.push("known certification-control stripping inventory is malformed");
  }
  const strippedUnknownCertificationControls =
    metadata?.strippedUnknownCertificationControlVariables;
  if (
    !Array.isArray(strippedUnknownCertificationControls) ||
    JSON.stringify(strippedUnknownCertificationControls) !==
      JSON.stringify(
        [...new Set(strippedUnknownCertificationControls ?? [])].sort(),
      ) ||
    strippedUnknownCertificationControls.some(
      (name) =>
        !isEnvironmentVariableName(name) ||
        Object.hasOwn(profile.contract.variables, name) ||
        !profile.contract.prefixes.some((prefix) => name.startsWith(prefix)) ||
        (metadata?.environmentNames ?? []).includes(name),
    )
  ) {
    issues.push("unknown certification-control stripping inventory is malformed");
  }
  const strippedUnknownApplicationFeatures =
    metadata?.strippedUnknownApplicationFeatureVariables;
  if (
    !Array.isArray(strippedUnknownApplicationFeatures) ||
    JSON.stringify(strippedUnknownApplicationFeatures) !==
      JSON.stringify(
        [...new Set(strippedUnknownApplicationFeatures ?? [])].sort(),
      ) ||
    strippedUnknownApplicationFeatures.some(
      (name) =>
        !isEnvironmentVariableName(name) ||
        Object.hasOwn(profile.contract.applicationFeatureVariables, name) ||
        !profile.contract.applicationFeaturePrefixes.some((prefix) =>
          name.startsWith(prefix),
        ) ||
        (metadata?.environmentNames ?? []).includes(name),
    )
  ) {
    issues.push("unknown application-feature stripping inventory is malformed");
  }
  return { valid: issues.length === 0, issues };
}
