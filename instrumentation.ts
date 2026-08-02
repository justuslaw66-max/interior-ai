import { validateDeploymentEnvironmentOrThrow } from "@/lib/config";

// Keep the server instrumentation entrypoint lightweight in local development.
// Importing Sentry here makes Next bundle its OpenTelemetry integrations before any
// request can complete, even when no DSN is configured.
export function register() {
  validateDeploymentEnvironmentOrThrow();
}

export function onRequestError(..._args: unknown[]) {}
