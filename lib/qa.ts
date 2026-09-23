export function isQaEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.NEXT_PUBLIC_ENABLE_QA_HOOKS === "1"
  );
}

type QaHooksEnvironment = {
  NODE_ENV?: string;
  NEXT_PUBLIC_APP_ENV?: string;
  NEXT_PUBLIC_ENABLE_QA_HOOKS?: string;
};

/** Runtime DOM hooks require an explicit flag and a non-production app target. */
export function areRuntimeQaHooksEnabled(
  environment: QaHooksEnvironment = {
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
    NEXT_PUBLIC_ENABLE_QA_HOOKS: process.env.NEXT_PUBLIC_ENABLE_QA_HOOKS,
  },
): boolean {
  const appEnvironment = environment.NEXT_PUBLIC_APP_ENV?.trim().toLowerCase() ??
    environment.NODE_ENV?.trim().toLowerCase();
  return (appEnvironment === "development" || appEnvironment === "staging" ||
      appEnvironment === "test") &&
    environment.NEXT_PUBLIC_ENABLE_QA_HOOKS === "1";
}
