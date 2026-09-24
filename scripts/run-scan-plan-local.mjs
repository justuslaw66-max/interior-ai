import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";

// Inert, explicit local-test OAuth fixture accepted by the existing auth boundary.
// No environment files, real credentials, shared database or remote services.
const suffix = randomBytes(16).toString("hex");
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", "3018"], {
  stdio: "inherit",
  env: {
    ...process.env, APP_ENV: "development", NEXT_PUBLIC_APP_ENV: "development", NEXT_TELEMETRY_DISABLED: "1",
    DATABASE_URL: "postgresql://isolated:isolated@127.0.0.1:1/scan_plan_disposable",
    FLOOR_PLAN_VISION_DISABLED: "1", FLOOR_PLAN_VISION_ENABLED: "0", OPENAI_API_KEY: "",
    GOOGLE_CLIENT_ID: `100000000000-gate-a3-ci-${suffix}.apps.googleusercontent.com`,
    GOOGLE_CLIENT_SECRET: `GOCSPX-gate-a3-ci-${suffix}`, AUTH_SECRET: randomBytes(32).toString("hex"),
    CI_AUTH_FIXTURE_ACTIVE: "1", CI_AUTH_FIXTURE_LOCAL_TEST: "1", NEXTAUTH_URL: "http://127.0.0.1:3018",
    NEXT_PUBLIC_POSTHOG_KEY: "", SENTRY_DSN: "", NEXT_PUBLIC_SENTRY_DSN: "",
  },
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => { process.exitCode = code ?? 1; });
