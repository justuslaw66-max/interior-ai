import { createHash } from "node:crypto";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const SENSITIVE_NAME = /SECRET|TOKEN|PASSWORD|PASSWD|DATABASE_URL|API_KEY|PRIVATE_KEY|CLIENT_SECRET|AUTH/i;

export const REQUIRED_SAFE_HOST_VARIABLES = ["PATH", "HOME", "TMPDIR"];

export function buildWindowOpeningChildEnvironment({
  hostEnvironment,
  values = {},
  requiredHostNames = REQUIRED_SAFE_HOST_VARIABLES,
}) {
  const environment = {};
  const records = [];
  for (const name of requiredHostNames) {
    const value = hostEnvironment[name];
    if (typeof value !== "string" || !value) {
      throw new Error(`Required allowlisted host environment variable is missing: ${name}.`);
    }
    environment[name] = value;
    records.push({
      name,
      classification: "non_secret",
      generated: false,
      source: "allowlisted_host",
      reason: name === "PATH" ? "resolve checked local executables" :
        name === "HOME" ? "tool runtime home directory" : "isolated temporary files",
    });
  }
  for (const [name, definition] of Object.entries(values)) {
    if (Object.hasOwn(environment, name)) {
      throw new Error(`Child environment variable is defined more than once: ${name}.`);
    }
    if (typeof definition?.value !== "string") {
      throw new Error(`Child environment variable requires a string value: ${name}.`);
    }
    const sensitive = definition.classification === "secret" || SENSITIVE_NAME.test(name);
    environment[name] = definition.value;
    records.push({
      name,
      classification: sensitive ? "secret" : "non_secret",
      generated: definition.generated === true,
      source: definition.source ?? (definition.generated ? "generated_for_run" : "explicit_constant"),
      reason: definition.reason,
      ...(sensitive || definition.generated
        ? { valueSha256: sha256(definition.value) }
        : {}),
    });
  }
  records.sort((left, right) => left.name.localeCompare(right.name));
  return { environment, records, names: records.map((entry) => entry.name) };
}

export function explicitEnvironmentValues(environment, names, reason) {
  return Object.fromEntries(names.map((name) => {
    const value = environment[name];
    if (typeof value !== "string" || !value) {
      throw new Error(`Required explicitly selected environment variable is missing: ${name}.`);
    }
    return [name, {
      value,
      generated: false,
      source: "explicit_outer_selection",
      reason,
    }];
  }));
}
