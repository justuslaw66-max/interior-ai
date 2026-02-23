import { PostHog } from "posthog-node";
import { config } from "@/lib/config";

let posthogClient: PostHog | null = null;

export function getPostHogClient() {
  if (!posthogClient) {
    const key = process.env.POSTHOG_KEY || process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) {
      if (config.isProdLike) {
        throw new Error("POSTHOG_KEY is required in staging/production");
      }
      return {
        capture: () => undefined,
        shutdown: async () => undefined,
      } as unknown as PostHog;
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
