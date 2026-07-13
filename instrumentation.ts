// Keep the server instrumentation entrypoint dependency-free in local development.
// Importing Sentry here makes Next bundle its OpenTelemetry integrations before any
// request can complete, even when no DSN is configured.
export function register() {}

export function onRequestError(..._args: unknown[]) {}
