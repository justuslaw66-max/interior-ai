import { PostHog } from "posthog-node";
import { config } from "@/lib/config";
import { isUsablePostHogKey } from "@/lib/posthog-config";

let posthogClient: PostHog | null = null;

const noopPostHogClient = {
  capture: () => undefined,
  shutdown: async () => undefined,
} as unknown as PostHog;

export function getPostHogClient() {
  if (process.env.NEXT_PUBLIC_ENABLE_QA_HOOKS === "1") {
    return noopPostHogClient;
  }

  if (!posthogClient) {
    const key = process.env.POSTHOG_KEY || process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!isUsablePostHogKey(key)) {
      if (config.isProdLike) {
        throw new Error("POSTHOG_KEY is required in staging/production");
      }
      return noopPostHogClient;
    }
    posthogClient = new PostHog(key, {
      host: process.env.POSTHOG_HOST || process.env.NEXT_PUBLIC_POSTHOG_HOST,
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return posthogClient;
}

export async function shutdownPostHog() {
  if (posthogClient) {
    await posthogClient.shutdown();
  }
}
